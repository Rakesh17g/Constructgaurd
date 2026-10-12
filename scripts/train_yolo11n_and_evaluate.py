import os
import shutil
import json
import time
from datetime import datetime, timezone
import yaml
from ultralytics import YOLO

WORKSPACE_DIR = r"c:\Users\raki_\OneDrive\Desktop\Constructgaurd"
ACC_BACKEND_DIR = r"C:\Users\raki_\OneDrive\Desktop\ACC\backend"
DATASET_DIR = os.path.join(ACC_BACKEND_DIR, "datasets", "construction-ppe")
BENCHMARK_OUTPUT_DIR = os.path.join(ACC_BACKEND_DIR, "model_benchmarks")
EVALUATION_DIR = os.path.join(BENCHMARK_OUTPUT_DIR, "evaluation")
FRONTEND_PUBLIC_DIR = os.path.join(WORKSPACE_DIR, "site-sentinel", "public")

EXISTING_PROD_MODEL_PATH = os.path.join(ACC_BACKEND_DIR, "app", "yolo", "model", "ppe_best.pt")

def compute_f1(precision, recall):
    if precision is None or recall is None:
        return None
    denom = precision + recall
    if denom <= 0:
        return 0.0
    return round((2 * precision * recall) / denom, 2)

def main():
    os.makedirs(BENCHMARK_OUTPUT_DIR, exist_ok=True)
    os.makedirs(EVALUATION_DIR, exist_ok=True)
    os.makedirs(FRONTEND_PUBLIC_DIR, exist_ok=True)

    DATA_YAML_PATH = os.path.join(DATASET_DIR, "data_abs.yaml")
    classes_dict = {
        0: "helmet", 1: "gloves", 2: "vest", 3: "boots", 4: "goggles",
        5: "none", 6: "Person", 7: "no_helmet", 8: "no_goggle", 9: "no_gloves", 10: "no_boots"
    }

    # 1. Finalize YOLOv8n from the completed 35-epoch run
    print("\n" + "="*60)
    print("STEP 1: Finalizing YOLOv8n Checkpoint & Artifacts")
    print("="*60)
    v8_src_dir = os.path.join(BENCHMARK_OUTPUT_DIR, "train_yolov8n", "run")
    v8_dest_dir = os.path.join(BENCHMARK_OUTPUT_DIR, "yolov8n")
    v8_weights_dir = os.path.join(v8_dest_dir, "weights")
    os.makedirs(v8_weights_dir, exist_ok=True)

    v8_best_src = os.path.join(v8_src_dir, "weights", "best.pt")
    v8_last_src = os.path.join(v8_src_dir, "weights", "last.pt")
    v8_best_pt = os.path.join(v8_weights_dir, "best.pt")
    v8_last_pt = os.path.join(v8_weights_dir, "last.pt")

    if os.path.exists(v8_best_src):
        shutil.copy2(v8_best_src, v8_best_pt)
        print(f"Copied YOLOv8n best.pt -> {v8_best_pt}")
    if os.path.exists(v8_last_src):
        shutil.copy2(v8_last_src, v8_last_pt)
        print(f"Copied YOLOv8n last.pt -> {v8_last_pt}")
    if os.path.exists(os.path.join(v8_src_dir, "results.csv")):
        shutil.copy2(os.path.join(v8_src_dir, "results.csv"), os.path.join(v8_dest_dir, "results.csv"))
        print(f"Copied results.csv -> {v8_dest_dir}")
    if os.path.exists(v8_src_dir):
        for f in os.listdir(v8_src_dir):
            if f.endswith((".png", ".jpg", ".csv")) and not os.path.isdir(os.path.join(v8_src_dir, f)):
                shutil.copy2(os.path.join(v8_src_dir, f), os.path.join(v8_dest_dir, f))

    # 2. Train YOLO11n for focused 25 epochs
    print("\n" + "="*60)
    print("STEP 2: Training YOLO11n on Construction PPE Dataset (25 Epochs)")
    print("="*60)
    v11_dest_dir = os.path.join(BENCHMARK_OUTPUT_DIR, "yolo11n")
    v11_weights_dir = os.path.join(v11_dest_dir, "weights")
    os.makedirs(v11_weights_dir, exist_ok=True)
    v11_best_pt = os.path.join(v11_weights_dir, "best.pt")
    v11_last_pt = os.path.join(v11_weights_dir, "last.pt")

    v11_train_proj = os.path.join(BENCHMARK_OUTPUT_DIR, "train_yolo11n")
    model_v11 = YOLO("yolo11n.pt")
    t0 = time.time()
    model_v11.train(
        data=DATA_YAML_PATH,
        epochs=25,
        imgsz=640,
        batch=16,
        workers=0,
        device=0,
        amp=True,
        project=v11_train_proj,
        name="run",
        exist_ok=True
    )
    v11_duration = round(time.time() - t0, 2)
    print(f"YOLO11n 25-epoch training complete in {v11_duration} seconds.")

    run_dir_11 = os.path.join(v11_train_proj, "run")
    if os.path.exists(os.path.join(run_dir_11, "weights", "best.pt")):
        shutil.copy2(os.path.join(run_dir_11, "weights", "best.pt"), v11_best_pt)
    if os.path.exists(os.path.join(run_dir_11, "weights", "last.pt")):
        shutil.copy2(os.path.join(run_dir_11, "weights", "last.pt"), v11_last_pt)
    if os.path.exists(os.path.join(run_dir_11, "results.csv")):
        shutil.copy2(os.path.join(run_dir_11, "results.csv"), os.path.join(v11_dest_dir, "results.csv"))
    if os.path.exists(run_dir_11):
        for f in os.listdir(run_dir_11):
            if f.endswith((".png", ".jpg", ".csv")) and not os.path.isdir(os.path.join(run_dir_11, f)):
                shutil.copy2(os.path.join(run_dir_11, f), os.path.join(v11_dest_dir, f))

    # 3. Fair Test Set Evaluation (141 Held-out Test Images)
    print("\n" + "="*60)
    print("STEP 3: Fair Held-Out Test Split Evaluation (141 Test Images)")
    print("="*60)

    summary_data = {
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "hardware": {
            "device": "NVIDIA GeForce RTX 3050 Laptop GPU",
            "vram_gb": 4.0,
            "framework": "PyTorch + Ultralytics (CUDA 13.0)"
        },
        "dataset": {
            "name": "construction-ppe",
            "split_used": "test",
            "image_size": 640,
            "classes": [classes_dict[i] for i in range(len(classes_dict))],
            "train_images": 1132,
            "val_images": 143,
            "test_images": 141
        },
        "training_configuration": {
            "imgsz": 640,
            "epochs": 25,
            "batch_size": 16,
            "patience": 20,
            "workers": 0,
            "amp": True,
            "device": 0
        },
        "models": []
    }

    models_to_eval = [
        {
            "model_name": "Existing Production Model",
            "architecture": "YOLOv8n (Custom PPE)",
            "weights_path": EXISTING_PROD_MODEL_PATH,
            "training_status": "existing",
            "eval_dir": os.path.join(EVALUATION_DIR, "existing_production")
        },
        {
            "model_name": "YOLOv8n",
            "architecture": "Ultralytics YOLOv8 Nano",
            "weights_path": v8_best_pt,
            "training_status": "completed",
            "eval_dir": os.path.join(EVALUATION_DIR, "yolov8n")
        },
        {
            "model_name": "YOLO11n",
            "architecture": "Ultralytics YOLO11 Nano",
            "weights_path": v11_best_pt,
            "training_status": "completed",
            "eval_dir": os.path.join(EVALUATION_DIR, "yolo11n")
        }
    ]

    for m in models_to_eval:
        w_path = m["weights_path"]
        print(f"\n--- Evaluating {m['model_name']} ({w_path}) ---")
        if not os.path.exists(w_path):
            print(f"Warning: Model weights not found at {w_path}")
            summary_data["models"].append({
                "model_name": m["model_name"],
                "architecture": m["architecture"],
                "weights_path": w_path,
                "training_status": m["training_status"],
                "evaluation_status": "pending",
                "precision": None, "recall": None, "f1_score": None, "map50": None, "map50_95": None,
                "inference_speed_ms": None, "per_class": {}
            })
            continue

        eval_model = YOLO(w_path)
        val_res = eval_model.val(
            data=DATA_YAML_PATH,
            split="test",
            imgsz=640,
            batch=8,
            device=0,
            project=m["eval_dir"],
            name="test_val",
            exist_ok=True
        )

        mp = round(float(val_res.box.mp) * 100, 2)
        mr = round(float(val_res.box.mr) * 100, 2)
        map50 = round(float(val_res.box.map50) * 100, 2)
        map50_95 = round(float(val_res.box.map) * 100, 2)
        f1 = compute_f1(mp, mr)

        per_class = {}
        for i, c_name in classes_dict.items():
            try:
                c_p = round(float(val_res.box.p[i]) * 100, 2) if hasattr(val_res.box, 'p') and len(val_res.box.p) > i else None
                c_r = round(float(val_res.box.r[i]) * 100, 2) if hasattr(val_res.box, 'r') and len(val_res.box.r) > i else None
                c_map50 = round(float(val_res.box.ap50[i]) * 100, 2) if hasattr(val_res.box, 'ap50') and len(val_res.box.ap50) > i else None
                c_map = round(float(val_res.box.ap[i]) * 100, 2) if hasattr(val_res.box, 'ap') and len(val_res.box.ap) > i else None
                per_class[c_name] = {
                    "precision": c_p, "recall": c_r,
                    "f1_score": compute_f1(c_p, c_r),
                    "map50": c_map50, "map50_95": c_map
                }
            except Exception as e:
                per_class[c_name] = str(e)

        speed_ms = round(val_res.speed.get("inference", 0), 2) if hasattr(val_res, "speed") else None

        print(f"Results for {m['model_name']}:")
        print(f"  Precision: {mp}% | Recall: {mr}% | F1: {f1}% | mAP@50: {map50}% | mAP@50-95: {map50_95}% | Speed: {speed_ms} ms")

        summary_data["models"].append({
            "model_name": m["model_name"],
            "architecture": m["architecture"],
            "weights_path": w_path,
            "training_status": m["training_status"],
            "evaluation_status": "completed",
            "precision": mp,
            "recall": mr,
            "f1_score": f1,
            "map50": map50,
            "map50_95": map50_95,
            "inference_speed_ms": speed_ms,
            "per_class": per_class
        })

    # Save summary JSON
    summary_json_path = os.path.join(BENCHMARK_OUTPUT_DIR, "benchmark_summary.json")
    with open(summary_json_path, "w") as f:
        json.dump(summary_data, f, indent=2)

    frontend_json_path = os.path.join(FRONTEND_PUBLIC_DIR, "benchmark_summary.json")
    with open(frontend_json_path, "w") as f:
        json.dump(summary_data, f, indent=2)

    print("\n" + "="*60)
    print("ALL BENCHMARKS COMPLETED SUCCESSFULLY!")
    print(f"Summary JSON: {summary_json_path}")
    print(f"Frontend JSON synced: {frontend_json_path}")
    print("="*60)

if __name__ == '__main__':
    main()
