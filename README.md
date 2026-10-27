# German Dictionary Application

A comprehensive German–English Dictionary and Vocabulary Learning Application available as a Python CLI and a modern static Web Application served via GitHub Pages (`docs/`) with a Supabase (PostgreSQL) backend.

This application allows users to store German and English words, search translations, practice vocabulary with flashcards in quiz mode, and track detailed learning analytics over time.

---

# Features

### Dictionary & Vocabulary Management
- Add new German–English translation pairs (Admin only)
- View and search words with live debounced search and highlight matching
- Alphabetical sorting by German or English words
- Edit and delete existing words (Admin only)
- Paginated table browsing (handles large vocabulary collections smoothly)

### Quiz Mode (Flashcards)
- Two practice directions:
  - English → German
  - German → Deutsch
- Interactive 3D flip card practice
- Self-grading system with real-time score pills and accuracy progress bar
- Guest mode support: practice immediately without signing in
- Persistent attempt history: quiz answers saved automatically per user when signed in

### My Stats Panel (Learning Analytics)
- Personal statistics tracked across all quiz sessions:
  - **Questions Attempted**: Total number of questions answered
  - **Correct Answers**: Number of correct responses
  - **Accuracy Rate**: Percentage calculated to two decimal places
- **Top 5 Weak Words**: Ranks the 5 words you miss most often in quiz practice, sorted by mistake frequency (descending) and English word (A–Z)
- Friendly empty states for new learners and clean mistake-free practice

### Role-Based Access Control (RLS & Supabase Auth)
- **Admins**: Privileged accounts with full permissions to add, edit, and delete words.
- **Students**: Registered accounts with email, password, and custom username. Can track quiz history and view personalized statistics.
- **Guests**: Instant access to dictionary browsing, searching, and quiz mode without sign-in.

---

# Technologies Used

- **Web Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 (Design tokens & flex/grid layout), `@supabase/supabase-js` UMD via jsDelivr CDN
- **Web Backend & Database**: Supabase (PostgreSQL, Supabase Auth, Row Level Security)
- **CLI Application**: Python 3, MySQL, `mysql-connector-python`

---

# Project Structure

```text
german_dictionary/
│
├── docs/                                  # Static Web App (served by GitHub Pages)
│   ├── index.html                         # Markup and modal structures
│   ├── app.js                             # Frontend logic, state, and Supabase client
│   └── style.css                          # Design tokens, typography, and responsive styles
│
├── supabase/
│   └── migrations/
│       └── 20261027210700_quiz_and_roles.sql # Postgres migration with RLS & functions
│
├── main.py                                # Python CLI + MySQL application
└── README.md
```

---

# Web App Setup & Database Migration (Supabase)

### Step 1: Run the Database Migration
1. Log into your [Supabase Dashboard](https://supabase.com/dashboard) and open your project.
2. Navigate to the **SQL Editor** in the left sidebar.
3. Open `supabase/migrations/20261027210700_quiz_and_roles.sql` from this repository, copy its contents, paste them into the SQL Editor, and click **Run**.
4. This migration will:
   - Create tables: `admins`, `users`, and `quiz_history` (with `word_id` matching `words.id` `bigint`).
   - Create helper function `public.is_admin()`.
   - Configure Row Level Security (RLS) policies on all tables so non-admins cannot mutate `words`, guests cannot write to tables, and students can only access their own profile and quiz history.

### Step 2: Create and Designate Your Admin User
1. Open the web app and click **Add Word** > **Sign In** > **Create Account** to register your account (or invite a user via Supabase Auth).
2. In Supabase Dashboard, navigate to **Authentication > Users** and copy your User UUID.
3. Open the **SQL Editor** and run the following command to grant admin privileges:

```sql
INSERT INTO admins (user_id) VALUES ('<your-auth-user-id>');
```

### Step 3: Verify Frontend Configuration
In `docs/app.js`, verify that the `CFG` block contains your Supabase project URL and anon public publishable key:

```javascript
const CFG = {
  SUPABASE_URL: "https://your-project-id.supabase.co",
  SUPABASE_KEY: "your-anon-publishable-key",
  PER_PAGE: 25,
  TABLE: "words",
  COL_EN: "english_word",
  COL_DE: "german_word",
};
```

---

# Python CLI Database Setup (MySQL)

For running the local Python CLI version (`main.py`):

## Step 1: Create Database
```sql
CREATE DATABASE german;
```

## Step 2: Use Database
```sql
USE german;
```

## Step 3: Install Required Python Module
```bash
pip install mysql-connector-python
```

## Step 4: Configure Credentials
Inside `main.py`, update the MySQL connection password:
```python
con = msc.connect(host='localhost', user='root', password='YOUR_PASSWORD')
```

## Step 5: Run the Application
```bash
python main.py
```

### Python CLI Menu
```text
1. View Words
2. Add Word
3. Search Word
4. Update Word
5. Delete Word
6. Quiz
7. My stats
0. Exit
```

---

# Author

Anant Shrey  
CBSE Class 12 Computer Science Project
