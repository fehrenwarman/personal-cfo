# Personal CFO

A full-stack personal finance app with AI-powered insights, built with React + Vite, Supabase, and Claude.

## Features

- Secure email/password auth via Supabase
- Transaction import from CSV with auto-categorization
- Account balance tracking (TFSA, RRSP, RESP, non-registered, savings)
- Live USD/CAD exchange rate (cached 4 hours)
- AI insights, allocation strategy, and full chat interface powered by Claude
- All data synced across devices via Supabase Postgres

---

## Step 1: Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**, give it a name, choose a region, set a strong DB password
3. Wait ~2 minutes for the project to provision

---

## Step 2: Run the database setup

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy the entire contents of `setup.sql` from this repo and paste it in
4. Click **Run** (or press Cmd+Enter)

This creates all 5 tables with Row Level Security and an auto-provision trigger for new users.

---

## Step 3: Get your Supabase credentials

1. In the Supabase dashboard, go to **Project Settings** (gear icon) > **API**
2. Copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public** key (starts with `eyJ...`)

---

## Step 4: Create your `.env` file

In the project root, create a file named `.env`:

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Never commit this file.** It is already in `.gitignore`.

---

## Step 5: Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Step 6: First-time setup in the app

1. **Sign up** with your email and password
2. Go to **Settings** and enter your Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com))
3. Fill in your profile (income, province, birth year, kids)
4. Go to **Accounts** and enter your current balances
5. Go to **Transactions** and drag-and-drop a CSV export from your bank

---

## Running on a second computer

1. Clone or copy the project folder
2. Create the `.env` file with the same Supabase credentials (see Step 4)
3. Run `npm install && npm run dev`

All your data lives in Supabase, so it will sync automatically once you sign in.

---

## CSV format

The importer auto-detects columns. Supported layouts:

- Single `Amount` column (negative = expense, positive = income)
- Separate `Debit` and `Credit` columns
- Date formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
- Currency column optional (USD or CAD detected automatically)

---

## Environment variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

The Anthropic API key is entered in the app's Settings tab and stored in Supabase, not in `.env`.

---

## Tech stack

- **Frontend**: React 18 + Vite
- **Database & Auth**: Supabase (Postgres + GoTrue)
- **AI**: Anthropic Claude (`claude-opus-4-5`)
- **Charts**: Recharts
- **CSV parsing**: PapaParse
- **Icons**: Lucide React
