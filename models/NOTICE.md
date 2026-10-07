# Construct gaurd — third-party model notice

The unmodified `ppe-yolo26n.onnx` artifact is the YOLO26n model from **yihong1120 / Construction-Hazard-Detection**, built using **Ultralytics YOLO26**.

- Model repository and documentation: https://huggingface.co/yihong1120/Construction-Hazard-Detection
- Source artifact: https://huggingface.co/yihong1120/Construction-Hazard-Detection/resolve/main/models/yolo26/onnx/yolo26n.onnx
- Full upstream application, training and export sources: https://github.com/yihong1120/Construction-Hazard-Detection
- Upstream license: GNU Affero General Public License v3.0 (AGPL-3.0), copied verbatim in `LICENSE`.
- Downloaded: 10 September 2026.

The source bundle contains the model and the custom inference/frontend source used by this prototype. Model inference results record the SHA-256 of the loaded artifact. The local integration uses ONNX Runtime CPU, not a hosted inference service. No site image is uploaded to Hugging Face for inference.

## Verified export contract
Input: `images`, float32 RGB `[1,3,640,640]`, values normalized to 0–1, letterboxed with value 114. Output: `output0` `[1,300,6]`, end-to-end YOLO26 detections `[x1,y1,x2,y2,confidence,class]`. End-to-end metadata is checked at runtime. Class labels are read from model metadata, not inferred from class numbers alone.

PPE rules use `NO-Hardhat` (2), `NO-Safety Vest` (4), and `Person` (5). Positive PPE detections include `Hardhat` (0) and `Safety Vest` (7). Other model classes are retained in the result but not included in the PPE risk score.

## Limitations
Author-reported FP32 YOLO26n box mAP50–95 is 0.4765 on the author's validation split; this is not an independent benchmark and is not a prediction of accuracy on your sites. Camera distance, lighting, occlusion, unfamiliar PPE and image quality can materially affect results. Counts are detections, not verified unique worker counts. A missing detection is not proof that required PPE is present.

Smoke tests cover inference execution, output coordinates, blank-image handling and the author's already-annotated example. They do not establish field accuracy. Use independently labeled site photographs for evaluation and threshold calibration before operational deployment. Retain human review and certified safety oversight.

Review AGPL obligations before public/networked or commercial distribution. Upstream source and license must remain available; do not market this bundled model as proprietary or trained by the project team.
