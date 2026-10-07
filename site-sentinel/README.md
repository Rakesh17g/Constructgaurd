# Construct gaurd

Interactive web application based on **Cloud-Based AI Construction Site Safety Intelligence and Corrective Action Platform**, Review 1, BECE355L.

## Architecture Highlights
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + DaisyUI. Deployed on Vercel.
- **Backend (ML inference)**: Python FastAPI + Ultralytics YOLO.
- **Authentication**: Supabase Auth integration for gated dashboard access. Complete enterprise login, signup, password-reset.

## Running Locally

**1. ML FastAPI Backend**
```bash
cd ml-service
python -m venv .venv

# Windows
.venv\Scripts\activate
# Mac/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**2. Frontend Application**
```bash
# In the root site-sentinel directory
npm install
npm run dev
```

## Try the workflow
1. Open **New inspection**, select a site and zone, and upload a JPG, PNG or WebP image.
2. The standalone Python FastAPI service seamlessly runs the image through Ultralytics YOLO26.
3. Automatically calculates PPE violations or alerts if a custom YOLO model isn't active.
4. Use **Analytics** for date/source filters, site comparisons, risk distributions, daily trends, detection totals and closure rate. Export filtered records as CSV.

Ensure `VITE_YOLO_API_URL` is set in your `.env.local` to point to the backend (by default `http://localhost:8000`), and that your Supabase credentials are in place to successfully sign-in.
