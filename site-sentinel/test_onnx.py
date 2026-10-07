import onnx

model = onnx.load('c:/Users/raki_/OneDrive/Desktop/Constructgaurd/site-sentinel/models/ppe-yolo26n.onnx')
print('Input:', [(i.name, [d.dim_value for d in i.type.tensor_type.shape.dim]) for i in model.graph.input])
print('Output:', [(o.name, [d.dim_value for d in o.type.tensor_type.shape.dim]) for o in model.graph.output])
print('Metadata:', [(m.key, m.value) for m in model.metadata_props])
