const ort = require('onnxruntime-node');

async function test() {
    try {
        const session = await ort.InferenceSession.create('./public/models/ppe-yolo26n.onnx');
        const inputNames = session.inputNames;

        // create a dummy float32 tensor [1, 3, 640, 640]
        const data = new Float32Array(1 * 3 * 640 * 640);
        data.fill(0.5); // some non-zero value
        const tensor = new ort.Tensor('float32', data, [1, 3, 640, 640]);

        const feeds = {};
        feeds[inputNames[0]] = tensor;

        const results = await session.run(feeds);
        const outputName = session.outputNames[0];
        const output = results[outputName];

        console.log(`Output dims: ${output.dims}`);
        const outData = output.data;
        // The output is [batch, n_detections, 6]. 
        // For the first detection, print the 6 values:
        for (let i = 0; i < Math.min(3, output.dims[1]); i++) {
            const start = i * 6;
            const values = outData.subarray(start, start + 6);
            console.log(`Detection ${i}:`, Array.from(values));
        }
    } catch (e) {
        console.error(e);
    }
}
test();
