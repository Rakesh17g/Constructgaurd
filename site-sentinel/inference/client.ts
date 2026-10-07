import { Analysis, Detection } from '../types';
import * as ort from 'onnxruntime-web';

// ─── ORT WASM Configuration ───────────────────────────────────────────────
// Force single-threaded, no-SIMD mode so SharedArrayBuffer is NOT required.
// SharedArrayBuffer requires Cross-Origin-Opener-Policy and
// Cross-Origin-Embedder-Policy headers, which break Spline and external CDN
// resources (Google Fonts, DaisyUI, Tailwind). By disabling threads/SIMD we
// use ort-wasm.wasm only — no SharedArrayBuffer needed at all.
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = false;
// Point to the bundled WASM files in public/onnxruntime/ instead of jsDelivr
ort.env.wasm.wasmPaths = '/onnxruntime/';

let session: ort.InferenceSession | null = null;
let modelLoading = false;
let modelLoadError: Error | null = null;

// The class map from ONNX model metadata
const CLASS_NAMES: Record<number, string> = {
    0: 'Hardhat',
    1: 'Mask',
    2: 'NO-Hardhat',
    3: 'NO-Mask',
    4: 'NO-Safety Vest',
    5: 'Person',
    6: 'Safety Cone',
    7: 'Safety Vest',
    8: 'machinery',
    9: 'utility pole',
    10: 'vehicle'
};

async function loadModel(): Promise<ort.InferenceSession> {
    // Return cached session
    if (session) return session;

    // If a previous attempt failed, surface that error immediately
    if (modelLoadError) throw modelLoadError;

    // If already loading, wait for it
    if (modelLoading) {
        while (modelLoading) await new Promise(r => setTimeout(r, 100));
        if (modelLoadError) throw modelLoadError;
        return session!;
    }

    modelLoading = true;
    const modelUrl = '/models/ppe-yolo26n.onnx';

    try {
        console.info('[YOLO] Checking model availability:', modelUrl);
        const response = await fetch(modelUrl);

        if (!response.ok) {
            throw new Error(
                `Model file returned HTTP ${response.status} ${response.statusText} ` +
                `for URL: ${modelUrl}. Content-Type: ${response.headers.get('content-type') ?? 'unknown'}`
            );
        }

        console.info('[YOLO] Downloading model ArrayBuffer...');
        const arrayBuffer = await response.arrayBuffer();

        console.info('[YOLO] Model downloaded, size:', arrayBuffer.byteLength);
        console.info('[YOLO] Creating ONNX session…');

        // Explicitly pass numThreads:1 to avoid any thread initialization dependencies.
        // We create the session from the ArrayBuffer directly to avoid the C++ fetch implementation
        // that frequently throws raw pointer exceptions (like 28858136) in Emscripten when network/CORS issues occur.
        session = await ort.InferenceSession.create(arrayBuffer, {
            executionProviders: ['wasm'],
        });

        console.info('[YOLO] Session ready. Inputs:', session.inputNames, 'Outputs:', session.outputNames);
        return session;

    } catch (e: any) {
        modelLoadError = e instanceof Error ? e : new Error(String(e));
        console.error('[YOLO] Failed to load model:', modelLoadError.message);
        throw modelLoadError;
    } finally {
        modelLoading = false;
    }
}

/**
 * Normalizes and preprocesses the image to 640×640 CHW float32 tensor.
 */
function preprocessImage(imgBuffer: Uint8ClampedArray, width: number, height: number): Float32Array {
    const inputSize = 640;
    const input = new Float32Array(3 * inputSize * inputSize);

    const scaleX = width / inputSize;
    const scaleY = height / inputSize;

    for (let y = 0; y < inputSize; y++) {
        for (let x = 0; x < inputSize; x++) {
            const origX = Math.min(Math.floor(x * scaleX), width - 1);
            const origY = Math.min(Math.floor(y * scaleY), height - 1);
            const idx = (origY * width + origX) * 4;

            input[0 * inputSize * inputSize + y * inputSize + x] = imgBuffer[idx] / 255.0; // R
            input[1 * inputSize * inputSize + y * inputSize + x] = imgBuffer[idx + 1] / 255.0; // G
            input[2 * inputSize * inputSize + y * inputSize + x] = imgBuffer[idx + 2] / 255.0; // B
        }
    }

    return input;
}

export async function analyzeImage(imageURL: string): Promise<Analysis> {
    const startMs = Date.now();

    // Load (or reuse cached) ONNX session
    const sess = await loadModel();

    // Decode image into pixel data via an off-screen canvas
    const imgElement = document.createElement('img');
    await new Promise<void>((res, rej) => {
        imgElement.onload = () => res();
        imgElement.onerror = () => rej(new Error('Image could not be decoded for inference.'));
        imgElement.src = imageURL;
    });

    const canvas = document.createElement('canvas');
    canvas.width = imgElement.naturalWidth || imgElement.width;
    canvas.height = imgElement.naturalHeight || imgElement.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not acquire 2D canvas context for image preprocessing.');
    ctx.drawImage(imgElement, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Build input tensor [1, 3, 640, 640]
    const inputData = preprocessImage(imgData.data, canvas.width, canvas.height);
    const tensor = new ort.Tensor('float32', inputData, [1, 3, 640, 640]);

    // Run inference
    let outputs: ort.InferenceSession.OnnxValueMapType;
    try {
        const inputName = sess.inputNames[0];
        outputs = await sess.run({ [inputName]: tensor });
    } catch (err: any) {
        console.error('[YOLO] Inference failed:', err);
        throw new Error(`YOLO inference failed: ${err.message ?? String(err)}`);
    }

    // Parse output [1, N, 6] — each row: [x1, y1, x2, y2, conf, cls]
    const outputName = sess.outputNames[0];
    const predictions = outputs[outputName];
    const outputData = predictions.data as Float32Array;
    const totalDetections = predictions.dims[1];

    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 640;
    const CONFIDENCE_THRESHOLD = 0.25;

    const mappedDetections: Detection[] = [];
    let persons = 0;
    let missingHelmets = 0;
    let missingVests = 0;

    for (let i = 0; i < totalDetections; i++) {
        const base = i * 6;
        const conf = outputData[base + 4];

        if (conf < CONFIDENCE_THRESHOLD || isNaN(conf)) continue;

        const x1 = Math.max(0, outputData[base] * scaleX);
        const y1 = Math.max(0, outputData[base + 1] * scaleY);
        const x2 = Math.min(canvas.width, outputData[base + 2] * scaleX);
        const y2 = Math.min(canvas.height, outputData[base + 3] * scaleY);
        const cls = Math.round(outputData[base + 5]);
        const label = CLASS_NAMES[cls] ?? 'unknown';

        mappedDetections.push({ classId: cls, label, confidence: conf, box: [x1, y1, x2, y2] });

        if (cls === 5) persons++;
        else if (cls === 2) missingHelmets++;
        else if (cls === 4) missingVests++;
    }

    return {
        model: 'ppe-yolo26n.onnx (Browser WASM)',
        modelSha256: 'local',
        threshold: CONFIDENCE_THRESHOLD,
        width: canvas.width,
        height: canvas.height,
        detections: mappedDetections,
        persons,
        missingHelmets,
        missingVests,
        warnings: [],
        elapsedMs: Date.now() - startMs,
        analyzedAt: new Date().toISOString(),
        runtime: 'ONNXRuntime Web (single-threaded WASM)',
    };
}
