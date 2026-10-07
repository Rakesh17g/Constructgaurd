import os
import io
import time
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO

app = FastAPI(title="Constructgaurd PPE Detection API", version="1.0.0")

# Setup CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins, but can be restricted in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration from Environment Variables
# The user asked for "yolo26n.pt". Since that's a fictional model version, 
# we'll default to the actual YOLOv8n to ensure it works, but allow overriding.
# Optional: if no env variable is given, use the bundled ONNX model
MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "../models/ppe-yolo26n.onnx")

# Load Model
print(f"Loading YOLO model from: {MODEL_PATH}")
try:
    model = YOLO(MODEL_PATH, task="detect")
    MODEL_LOADED = True
except Exception as e:
    print(f"Failed to load model {MODEL_PATH}: {e}")
    model = None
    MODEL_LOADED = False

@app.get("/health")
async def health_check():
    return {
        "status": "ok" if MODEL_LOADED else "error",
        "model": MODEL_PATH,
        "model_loaded": MODEL_LOADED,
        "classes": model.names if MODEL_LOADED else {}
    }

@app.get("/model-info")
async def model_info():
    if not MODEL_LOADED:
        raise HTTPException(status_code=500, detail="Model is not loaded.")
        
    return {
        "model_filename": MODEL_PATH,
        "model_type": type(model).__name__,
        "available_classes": model.names,
        "device": str(model.device),
    }

@app.post("/detect")
async def detect(image: UploadFile = File(...)):
    if not MODEL_LOADED:
        raise HTTPException(status_code=500, detail="Inference service: Backend model failed to load.")
        
    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image.")
        
    try:
        contents = await image.read()
        pil_image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read image: {str(e)}")

    width, height = pil_image.size

    # Configurable limits
    confidence_threshold = float(os.getenv("YOLO_CONFIDENCE", "0.25"))

    try:
        # Run inference
        start_time = time.time()
        results = model(pil_image, conf=confidence_threshold)
        inference_time = time.time() - start_time
        
        detections = []
        # Parse official Ultralytics YOLO results
        for r in results:
            boxes = r.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                
                detections.append({
                    "class_id": cls_id,
                    "class_name": cls_name,
                    "confidence": conf,
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2
                })
                
        return JSONResponse(content={
            "success": True,
            "model": MODEL_PATH,
            "inference_time_ms": round(inference_time * 1000, 2),
            "image": {
                "width": width,
                "height": height
            },
            "detections": detections,
            "summary": {
                "total_detections": len(detections)
            }
        })
        
    except Exception as e:
        print(f"Inference error: {e}")
        raise HTTPException(status_code=500, detail=f"Inference failed during model execution.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
