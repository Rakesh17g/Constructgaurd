# Construct gaurd

Interactive website prototype based on **Cloud-Based AI Construction Site Safety Intelligence and Corrective Action Platform**, Review 1, BECE355L.

## Try the workflow
1. Open **New inspection**, select a site and zone, and upload a JPG, PNG or WebP image.
2. YOLO26n automatically analyzes the image, draws PPE bounding boxes, and fills missing-helmet and missing-vest detection counts. Zone history adds repeat-violation points automatically (same PPE issue in the past 30 days, excluding sample records). The optional critical-site-rule factor remains a supervisor declaration.
3. Assign a supervisor and due date. These are required for scores of 30 or higher.
4. Open the record and choose **Start corrective action**, then **Submit for verification**.
5. Upload follow-up evidence for a new YOLO check. Closure requires at least one person detection, no missing-PPE detections, a reviewer name, and a human confirmation that the original issues are corrected.
6. A new inspection with zero detected violations is **Needs review**, not automatically Compliant. A human must inspect the evidence to confirm compliance.
7. Use **Analytics** for date/source filters, site comparisons, risk distributions, daily trends, detection totals and closure rate. Export filtered records as CSV.

## Working features
Responsive overview, dedicated analytics, site/zone management, inspection search, image uploads, real YOLO PPE inference, bounding boxes/confidence, automatic risk calculation, action board, activity trails, AI-assisted human verification, CSV export, and saved workspace records.

Risk: 25 points per missing helmet; 15 per missing vest; 10 for multiple violations; 10 for repeated violations; 25 for a critical rule violation. Scores are capped at 100. Severity thresholds are 30, 60, and 80. The critical-rule weight of 25 is a prototype choice within the report's proposed 20–30 range.

## Runtime and limitations
React + TypeScript + Lucide + DaisyUI. This source targets the Tasklet app preview and its file-storage bridge, **not a standalone production deployment**. `app.tsx` contains the workspace storage location. Records and resized images persist in the workspace; the initial eight records and three sites are illustrative. Uploaded images are resized to a maximum dimension of 1,400 pixels.

A real pretrained YOLO26n ONNX model is bundled in `models/`. `inference/detect.py` runs it through ONNX Runtime CPU; `inference/client.ts` sends image requests through the workspace bridge. Dependencies are pinned and prepared with `uv` when needed: onnxruntime 1.29.0, pillow 12.3.0, numpy 2.5.3. The runtime may need network access to install packages on a fresh sandbox, but inference does not send images to an external AI provider. Confidence is fixed at 35% and recorded in the audit data. Temporary request files are removed by the inference script after each completed attempt. Human verification is still required: zero detections do not establish compliance.

User authentication, role enforcement, an external cloud database, and email notifications are not connected. The displayed profile is not an authenticated identity. This single-workspace prototype is not designed for concurrent users or large datasets. See `models/NOTICE.md` and `models/LICENSE` for attribution, model limitations and AGPL-3.0 deployment obligations.

For deployment, replace workspace storage with a secured backend and object storage, add authentication and permissions, deploy the bundled YOLO inference service with request limits and monitoring, and implement notifications and protected audit logging. Never use this prototype as a substitute for certified safety oversight.
