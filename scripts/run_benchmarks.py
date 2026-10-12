import os
import shutil
import json
import time
from datetime import datetime, timezone
import yaml
from ultralytics import YOLO

# 1. Environment & Paths Configuration
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

    # 2. Verify dataset YAML
    DATA_YAML_PATH = os.path.join(DATASET_DIR, "data_abs.yaml")
    classes_dict = {
        0: "helmet", 1: "gloves", 2: "vest", 3: "boots", 4: "goggles",
        5: "none", 6: "Person", 7: "no_helmet", 8: "no_goggle", 9: "no_gloves", 10: "no_boots"
    }
    data_cfg = {
        "path": DATASET_DIR.replace("\\", "/"),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": classes_dict
    }
    with open(DATA_YAML_PATH, "w") as f:
        yaml.dump(data_cfg, f, default_flow_style=False)

    print(f"[Dataset] Prepared absolute dataset YAML at: {DATA_YAML_PATH}")

    # Structure for benchmark summary
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
            "epochs": 100,
            "batch_size": 8,
            "patience": 20,
            "workers": 0,
            "amp": True,
            "device": 0
        },
        "models": []
    }

    # 3. Step A: Train YOLOv8n
    v8_dest_dir = os.path.join(BENCHMARK_OUTPUT_DIR, "yolov8n")
    os.makedirs(v8_dest_dir, exist_ok=True)
    v8_weights_dir = os.path.join(v8_dest_dir, "weights")
    os.makedirs(v8_weights_dir, exist_ok=True)

    v8_best_pt = os.path.join(v8_weights_dir, "best.pt")
    v8_training_needed = not os.path.exists(v8_best_pt)

    if v8_training_needed:
        print("\n" + "="*60)
        print("STEP 1: Training YOLOv8n on Construction PPE Dataset")
        print("="*60)
        v8_train_proj = os.path.join(BENCHMARK_OUTPUT_DIR, "train_yolov8n")
        model_v8 = YOLO("yolov8n.pt")
        t0 = time.time()
        train_results_v8 = model_v8.train(
            data=DATA_YAML_PATH,
            epochs=100,
            patience=20,
            imgsz=640,
            batch=8,
            workers=0,
            device=0,
            amp=True,
            project=v8_train_proj,
            name="run",
            exist_ok=True
        )
        v8_duration = round(time.time() - t0, 2)
        print(f"YOLOv8n training finished in {v8_duration} seconds.")

        # Copy artifacts
        run_dir = os.path.join(v8_train_proj, "run")
        if os.path.exists(os.path.join(run_dir, "weights", "best.pt")):
            shutil.copy2(os.path.join(run_dir, "weights", "best.pt"), os.path.join(v8_weights_dir, "best.pt"))
        if os.path.exists(os.path.join(run_dir, "weights", "last.pt")):
            shutil.copy2(os.path.join(run_dir, "weights", "last.pt"), os.path.join(v8_weights_dir, "last.pt"))
        if os.path.exists(os.path.join(run_dir, "results.csv")):
            shutil.copy2(os.path.join(run_dir, "results.csv"), os.path.join(v8_dest_dir, "results.csv"))
        for f in os.listdir(run_dir):
            if f.endswith((".png", ".jpg", ".csv")) and not os.path.isdir(os.path.join(run_dir, f)):
                shutil.copy2(os.path.join(run_dir, f), os.path.join(v8_dest_dir, f))
    else:
        print(f"\n[YOLOv8n] Trained weights already exist at: {v8_best_pt}")

    # 4. Step B: Train YOLO11n
    v11_dest_dir = os.path.join(BENCHMARK_OUTPUT_DIR, "yolo11n")
    os.makedirs(v11_dest_dir, exist_ok=True)
    v11_weights_dir = os.path.join(v11_dest_dir, "weights")
    os.makedirs(v11_weights_dir, exist_ok=True)

    v11_best_pt = os.path.join(v11_weights_dir, "best.pt")
    v11_training_needed = not os.path.exists(v11_best_pt)

    if v11_training_needed:
        print("\n" + "="*60)
        print("STEP 2: Training YOLO11n on Construction PPE Dataset")
        print("="*60)
        v11_train_proj = os.path.join(BENCHMARK_OUTPUT_DIR, "train_yolo11n")
        model_v11 = YOLO("yolo11n.pt")
        t0 = time.time()
        train_results_v11 = model_v11.train(
            data=DATA_YAML_PATH,
            epochs=100,
            patience=20,
            imgsz=640,
            batch=8,
            workers=0,
            device=0,
            amp=True,
            project=v11_train_proj,
            name="run",
            exist_ok=True
        )
        v11_duration = round(time.time() - t0, 2)
        print(f"YOLO11n training finished in {v11_duration} seconds.")

        # Copy artifacts
        run_dir = os.path.join(v11_train_proj, "run")
        if os.path.exists(os.path.join(run_dir, "weights", "best.pt")):
            shutil.copy2(os.path.join(run_dir, "weights", "best.pt"), os.path.join(v11_weights_dir, "best.pt"))
        if os.path.exists(os.path.join(run_dir, "weights", "last.pt")):
            shutil.copy2(os.path.join(run_dir, "weights", "last.pt"), os.path.join(v11_weights_dir, "last.pt"))
        if os.path.exists(os.path.join(run_dir, "results.csv")):
            shutil.copy2(os.path.join(run_dir, "results.csv"), os.path.join(v11_dest_dir, "results.csv"))
        for f in os.listdir(run_dir):
            if f.endswith((".png", ".jpg", ".csv")) and not os.path.isdir(os.path.join(run_dir, f)):
                shutil.copy2(os.path.join(run_dir, f), os.path.join(v11_dest_dir, f))
    else:
        print(f"\n[YOLO11n] Trained weights already exist at: {v11_best_pt}")

    # 5. Step C: Rigorous Evaluation on Test Split for all 3 models
    print("\n" + "="*60)
    print("STEP 3: Fair Held-Out Test Evaluation (141 Test Images)")
    print("="*60)

    models_to_evaluate = [
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

    for m_info in models_to_evaluate:
        m_name = m_info["model_name"]
        w_path = m_info["weights_path"]
        os.makedirs(m_info["eval_dir"], exist_ok=True)

        print(f"\n--- Evaluating {m_name} ({w_path}) ---")
        if not os.path.exists(w_path):
            print(f"Warning: Weights not found at {w_path}. Marking evaluation as pending.")
            summary_data["models"].append({
                "model_name": m_name,
                "architecture": m_info["architecture"],
                "weights_path": w_path,
                "training_status": m_info["training_status"],
                "evaluation_status": "pending",
                "precision": None,
                "recall": None,
                "f1_score": None,
                "map50": None,
                "map50_95": None,
                "inference_speed_ms": None,
                "per_class": {}
            })
            continue

        eval_model = YOLO(w_path)
        val_res = eval_model.val(
            data=DATA_YAML_PATH,
            split="test",
            imgsz=640,
            batch=8,
            device=0,
            project=m_info["eval_dir"],
            name="test_val",
            exist_ok=True
        )

        mp = round(float(val_res.box.mp) * 100, 2)
        mr = round(float(val_res.box.mr) * 100, 2)
        map50 = round(float(val_res.box.map50) * 100, 2)
        map50_95 = round(float(val_res.box.map) * 100, 2)
        f1 = compute_f1(mp, mr)

        # Calculate per-class metrics
        per_class = {}
        class_names = [classes_dict[i] for i in range(len(classes_dict))]
        for i, c_name in enumerate(class_names):
            try:
                c_p = round(float(val_res.box.p[i]) * 100, 2) if hasattr(val_res.box, 'p') and len(val_res.box.p) > i else None
                c_r = round(float(val_res.box.r[i]) * 100, 2) if hasattr(val_res.box, 'r') and len(val_res.box.r) > i else None
                c_map50 = round(float(val_res.box.ap50[i]) * 100, 2) if hasattr(val_res.box, 'ap50') and len(val_res.box.ap50) > i else None
                c_map = round(float(val_res.box.ap[i]) * 100, 2) if hasattr(val_res.box, 'ap') and len(val_res.box.ap) > i else None
                c_f1 = compute_f1(c_p, c_r) if (c_p is not None and c_r is not None) else None
                per_class[c_name] = {
                    "precision": c_p,
                    "recall": c_r,
                    "f1_score": c_f1,
                    "map50": c_map50,
                    "map50_95": c_map
                }
            except Exception as e:
                per_class[c_name] = str(e)

        speed_info = val_res.speed if hasattr(val_res, 'speed') else {}
        inference_ms = round(speed_info.get("inference", 0), 2)

        print(f"Results for {m_name}:")
        print(f"  Precision: {mp}% | Recall: {mr}% | F1: {f1}% | mAP@50: {map50}% | mAP@50-95: {map50_95}%")
        print(f"  Inference speed: {inference_ms} ms/image")

        summary_data["models"].append({
            "model_name": m_name,
            "architecture": m_info["architecture"],
            "weights_path": w_path,
            "training_status": m_info["training_status"],
            "evaluation_status": "completed",
            "precision": mp,
            "recall": mr,
            "f1_score": f1,
            "map50": map50,
            "map50_95": map50_95,
            "inference_speed_ms": inference_ms,
            "per_class": per_class
        })

    # 6. Save benchmark_summary.json
    summary_json_path = os.path.join(BENCHMARK_OUTPUT_DIR, "benchmark_summary.json")
    with open(summary_json_path, "w") as f:
        json.dump(summary_data, f, indent=2)

    # Copy to frontend public dir for immediate client consumption
    frontend_json_path = os.path.join(FRONTEND_PUBLIC_DIR, "benchmark_summary.json")
    with open(frontend_json_path, "w") as f:
        json.dump(summary_data, f, indent=2)

    print("\n" + "="*60)
    print("BENCHMARK COMPLETE!")
    print(f"Summary saved to: {summary_json_path}")
    print(f"Frontend summary synced to: {frontend_json_path}")
    print("="*60)

if __name__ == '__main__':
    main()
