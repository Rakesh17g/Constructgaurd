"""Construct gaurd: real YOLO26n PPE inference, CPU/ONNX Runtime.
No network requests. Input is a private, resized image request JSON; output is JSON.
Model source and AGPL-3.0 attribution: ../models/NOTICE.md.
"""
from __future__ import annotations
import ast, base64, hashlib, io, json, sys, time, warnings
from pathlib import Path
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

MODEL = Path(__file__).resolve().parent.parent / 'models' / 'ppe-yolo26n.onnx'
Image.MAX_IMAGE_PIXELS = 20_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)

def detect(data:dict) -> dict:
    started = time.perf_counter()
    threshold = float(data.get('threshold', 0.35))
    if not 0.1 <= threshold <= 0.9:
        raise ValueError('Confidence threshold must be between 0.1 and 0.9.')
    encoded = data.get('image', '')
    if not isinstance(encoded, str) or not encoded.startswith(('data:image/jpeg;base64,','data:image/png;base64,','data:image/webp;base64,')):
        raise ValueError('Expected a JPEG, PNG or WebP data URL.')
    raw = base64.b64decode(encoded.split(',',1)[1], validate=True)
    if len(raw) > 9*1024*1024:
        raise ValueError('Image exceeds the inference size limit.')
    with Image.open(io.BytesIO(raw)) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
    width, height = image.size
    if width < 16 or height < 16:
        raise ValueError('Image is too small for meaningful detection.')
    # Fixed 640x640 letterbox, RGB, CHW, float32 / 255 (Ultralytics export).
    ratio = min(640 / width, 640 / height)
    nw, nh = round(width*ratio), round(height*ratio)
    left, top = round((640-nw)/2-0.1), round((640-nh)/2-0.1)
    canvas = Image.new('RGB', (640,640), (114,114,114))
    canvas.paste(image.resize((nw,nh),Image.Resampling.BILINEAR),(left,top))
    tensor = np.ascontiguousarray(np.asarray(canvas,dtype=np.float32).transpose(2,0,1)[None] / 255.0)
    model_bytes = MODEL.read_bytes()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(model_bytes, sess_options=options, providers=['CPUExecutionProvider'])
    metadata = session.get_modelmeta().custom_metadata_map
    labels = ast.literal_eval(metadata['names'])
    if metadata.get('end2end') != 'True' or labels.get(2) != 'NO-Hardhat' or labels.get(4) != 'NO-Safety Vest':
        raise RuntimeError('The model does not match the verified PPE export.')
    predictions = session.run(None, {session.get_inputs()[0].name:tensor})[0]
    if predictions.shape != (1,300,6):
        raise RuntimeError(f'Unsupported model output shape: {predictions.shape}')
    # Verified NMS-free end-to-end YOLO26 export: [x1,y1,x2,y2,confidence,class].
    detections = []
    for row in predictions[0]:
        if not np.isfinite(row).all():
            continue
        x1,y1,x2,y2,confidence,category = map(float,row)
        if confidence < threshold:
            continue
        cls = int(round(category))
        if cls not in labels or abs(category-cls) > 0.001:
            continue
        x1,x2 = [min(width,max(0,(x-left)/ratio)) for x in (x1,x2)]
        y1,y2 = [min(height,max(0,(y-top)/ratio)) for y in (y1,y2)]
        if x2<=x1 or y2<=y1:
            continue
        detections.append({'classId':cls,'label':labels[cls],'confidence':round(confidence,4),'box':[round(x1,1),round(y1,1),round(x2,1),round(y2,1)]})
    count = lambda label:sum(d['label']==label for d in detections)
    persons, helmets, vests = count('Person'),count('NO-Hardhat'),count('NO-Safety Vest')
    notes=['Model output is decision support, not proof of worker compliance. Review image evidence.']
    if not persons:
        notes.append('No person detected at the selected threshold. Do not infer that the site is safe.')
    if not helmets and not vests:
        notes.append('No missing-PPE detections; occluded, small, or missed workers may still have violations.')
    return {'model':'YOLO26n Construction-Hazard-Detection','modelSha256':hashlib.sha256(model_bytes).hexdigest(),'threshold':threshold,'width':width,'height':height,'detections':detections,'persons':persons,'missingHelmets':helmets,'missingVests':vests,'warnings':notes,'elapsedMs':round((time.perf_counter()-started)*1000),'analyzedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'runtime':'ONNX Runtime CPU'}

if __name__ == '__main__':
    request = Path(sys.argv[1]).resolve()
    # Restrict to UUID-named request files in this thread's inference request folder.
    allowed = Path(__file__).resolve().parents[3] / 'construct-gaurd-inference'
    if request.parent != allowed or request.suffix != '.json':
        raise ValueError('Invalid inference request location.')
    try:
        data=json.loads(request.read_text())
        print(json.dumps(detect(data),separators=(',',':')))
    finally:
        request.unlink(missing_ok=True)
