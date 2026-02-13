# Deploying Backend to Railway 🚂

Since this is a monorepo, deploying the backend requires 2 specific settings: **Root Directory** and **Environment Variables**.

## Step 1: Create Project
1.  Log in to [Railway](https://railway.app/).
2.  Click **New Project** -> **Deploy from GitHub repo**.
3.  Select your repo: `akhbarsingh06-dev/arbitrage`.
4.  Click **Deploy Now**.

## Step 2: Configure Monorepo Settings (CRITICAL)
*The deployment will likely fail initially because it tries to build the root. We need to point it to `backend/`.*

1.  Click on the project card (Service) in Railway.
2.  Go to **Settings** -> **General**.
3.  Scroll down to **Root Directory**.
4.  Enter: `/backend`
5.  Click **Save**.
6.  Railway will automatically trigger a re-deploy.

## Step 3: Verify Build Commands
Railway usually auto-detects these from `backend/package.json`, but verify them in **Settings** -> **Build**:
*   **Build Command**: `npm install && npm run build` (or `tsc`)
*   **Start Command**: `npm run start`

## Step 4: Add Environment Variables
Go to the **Variables** tab and add the following (Copy from your local `.env`):

| Variable Key | Value (Example) |
| :--- | :--- |
| `BASE_RPC_URL` | `https://base.publicnode.com` (Or a paid Alchemy/Infura URL for better stability) |
| `RELAYER_PRIVATE_KEY` | `0x...` (Your wallet private key for executing trades) |
| `FLASH_LOAN_EXECUTOR_ADDRESS` | `0x6973EfD2C896CDeD802587bFceDcc42Fa7eB0C43` |
| `ARBITRAGE_ROUTER_ADDRESS` | `0xCa69f30135c86eB6C3F979b37774E49DB637bd8b` |
| `TREASURY_ADDRESS` | `0x0A199B211Da6892EffDAD353a67f7f1e442d8472` |
| `UNISWAP_V3_ADAPTER_ADDRESS` | `0xcF41bc47b8b29e573b27e264520e88387FDd0212` |
| `AERODROME_ADAPTER_ADDRESS` | `0x7c5224ee6F36962D088e726dcD2608a6989e4d59` |
| `PANCAKESWAP_V3_ADAPTER_ADDRESS` | `0x99f358BC637e5e42CD41AfE441dC72a56641801D` |
| `CORS_ORIGIN` | `*` (Or your Vercel frontend URL: `https://your-frontend.vercel.app`) |
| `PORT` | `3001` (Railway usually sets `PORT` automatically, but safe to add) |

## Step 5: Copy Backend URL
Once deployed, Railway will generate a public URL (e.g., `https://base-arb-backend-production.up.railway.app`).
1.  Copy this URL.
2.  Go to your **Vercel Frontend** project.
3.  Update `NEXT_PUBLIC_API_URL` to this new Railway URL.
4.  Update `NEXT_PUBLIC_WS_URL` to `wss://base-arb-backend-production.up.railway.app`.
5.  Re-deploy Frontend.
