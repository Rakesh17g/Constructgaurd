import onnxruntime as ort
import numpy as np

# Load model
sess = ort.InferenceSession('c:/Users/raki_/OneDrive/Desktop/Constructgaurd/site-sentinel/models/ppe-yolo26n.onnx')

# Create dummy input [1, 3, 640, 640]
dummy_input = np.random.randn(1, 3, 640, 640).astype(np.float32)

# Run inference
outputs = sess.run(None, {'images': dummy_input})

print(f"Output shape: {outputs[0].shape}")
print(f"First 2 detections:\n{outputs[0][0, :2, :]}")
