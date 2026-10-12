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
// NOTE: modelLoadError is intentionally NOT cached permanently.
// A transient WASM initialization crash (Emscripten abort) should be
// retryable — the user may retry if, for example, a previous tab context
// had a stale SharedArrayBuffer lock or the WASM heap was corrupted.
let modelLoadError: Error | null = null;

// The class map from ONNX model metadata
const CLASS_NAMES: Record<number, string> = {
    0: 'Helmet',
    1: 'Mask',
    2: 'NO-Helmet',
    3: 'NO-Mask',
    4: 'NO-Safety Vest',
    5: 'Person',
    6: 'Safety Cone',
    7: 'Safety Vest',
    8: 'machinery',
    9: 'utility pole',
    10: 'vehicle'
};

/**
 * Converts any thrown value into a human-readable Error.
 * Emscripten/WASM abort() throws raw integer heap pointers (e.g. 28858136)
 * that have no .message property. We map those to a descriptive string so
 * the UI always shows something actionable rather than a raw number.
 */
function toReadableError(e: unknown): Error {
    if (e instanceof Error) return e;
    if (typeof e === 'number') {
        // Raw Emscripten abort pointer — WASM initialization failure.
        console.error('[YOLO] WASM abort pointer:', e, '(0x' + e.toString(16) + ')');
        return new Error(
            'ONNX Runtime WASM initialization failed (abort code 0x' + e.toString(16) + '). ' +
            'This can happen when the WASM binary is incompatible with your browser or operating system. ' +
            'Try refreshing the page, then retry detection.'
        );
    }
    return new Error(String(e));
}

/**
 * Resets the cached session and error state so that a fresh load attempt
 * can be made. Call this before retrying after a model-load failure.
 */
export function resetModelState(): void {
    session = null;
    modelLoadError = null;
    modelLoading = false;
}

async function loadModel(): Promise<ort.InferenceSession> {
    // Return cached session
    if (session) return session;

    // If already loading, wait for it
    if (modelLoading) {
        while (modelLoading) await new Promise(r => setTimeout(r, 100));
        if (modelLoadError) throw modelLoadError;
        return session!;
    }

    // Surface any previously cached load error — caller can call
    // resetModelState() before retrying to clear this.
    if (modelLoadError) throw modelLoadError;

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

        console.info('[YOLO] Model downloaded, size:', arrayBuffer.byteLength, 'bytes');
        console.info('[YOLO] Creating ONNX session (single-threaded WASM, no SIMD)…');

        // Use Uint8Array to avoid any internal URL-fetch path in WASM glue code.
        // executionProviders: ['wasm'] forces the pure-WASM backend.
        // interWopNumThreads / intraOpNumThreads reinforce single-threaded mode
        // even if ort.env.wasm.numThreads is ignored by older ORT builds.
        session = await ort.InferenceSession.create(new Uint8Array(arrayBuffer), {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all',
            interOpNumThreads: 1,
            intraOpNumThreads: 1,
        });

        console.info('[YOLO] Session ready. Inputs:', session.inputNames, 'Outputs:', session.outputNames);
        return session;

    } catch (e: unknown) {
        modelLoadError = toReadableError(e);
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

/**
 * Parses the YOLO output tensor.
 * The model outputs [1, 300, 6] where each row is [x1, y1, x2, y2, conf, cls]
 * (post-NMS detections, already in 640×640 coordinate space).
 */
function parseDetections(
    outputData: Float32Array,
    totalDetections: number,
    scaleX: number,
    scaleY: number,
    canvasW: number,
    canvasH: number,
    threshold: number
): { detections: Detection[]; persons: number; missingHelmets: number; missingVests: number } {
    const detections: Detection[] = [];
    let persons = 0;
    let missingHelmets = 0;
    let missingVests = 0;

    for (let i = 0; i < totalDetections; i++) {
        const base = i * 6;
        const conf = outputData[base + 4];

        if (!isFinite(conf) || conf < threshold) continue;

        const x1 = Math.max(0, outputData[base] * scaleX);
        const y1 = Math.max(0, outputData[base + 1] * scaleY);
        const x2 = Math.min(canvasW, outputData[base + 2] * scaleX);
        const y2 = Math.min(canvasH, outputData[base + 3] * scaleY);
        const cls = Math.round(outputData[base + 5]);
        const label = CLASS_NAMES[cls] ?? `class_${cls}`;

        detections.push({ classId: cls, label, confidence: conf, box: [x1, y1, x2, y2] });

        if (cls === 5) persons++;
        else if (cls === 2) missingHelmets++;  // NO-Hardhat
        else if (cls === 4) missingVests++;    // NO-Safety Vest
    }

    return { detections, persons, missingHelmets, missingVests };
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
    } catch (err: unknown) {
        const readable = toReadableError(err);
        console.error('[YOLO] Inference failed:', readable.message);
        throw new Error(`YOLO inference failed: ${readable.message}`);
    }

    // Parse output [1, 300, 6] — each row: [x1, y1, x2, y2, conf, cls]
    // dims[0] = batch (1), dims[1] = num_detections (300), dims[2] = fields (6)
    const outputName = sess.outputNames[0];
    const predictions = outputs[outputName];
    const outputData = predictions.data as Float32Array;
    const totalDetections = predictions.dims[1] as number;

    console.info('[YOLO] Raw output dims:', [...predictions.dims], 'total detections slot:', totalDetections);

    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 640;
    const CONFIDENCE_THRESHOLD = 0.25;

    const { detections, persons, missingHelmets, missingVests } = parseDetections(
        outputData, totalDetections, scaleX, scaleY, canvas.width, canvas.height, CONFIDENCE_THRESHOLD
    );

    console.info(
        `[YOLO] Inference complete in ${Date.now() - startMs}ms.`,
        `Detections above threshold: ${detections.length}.`,
        `Persons: ${persons}, Missing helmets: ${missingHelmets}, Missing vests: ${missingVests}.`
    );

    return {
        model: 'ppe-yolo26n.onnx (Browser WASM)',
        modelSha256: 'local',
        threshold: CONFIDENCE_THRESHOLD,
        width: canvas.width,
        height: canvas.height,
        detections,
        persons,
        missingHelmets,
        missingVests,
        warnings: [],
        elapsedMs: Date.now() - startMs,
        analyzedAt: new Date().toISOString(),
        runtime: 'ONNXRuntime Web (single-threaded WASM)',
    };
}
