# German Dictionary Application

A simple German-English Dictionary Application originally made using Python and MySQL.

This application allows users to store German and English words, search translations, and practice vocabulary using a quiz mode.

---

# Features

- Add new German-English words
- View all saved words
- Search translations
- Update existing words
- Delete words
- Quiz Mode
  - English → German
  - German → English
- Continuous quiz system until user exits

---

# Technologies Used

- Python
- MySQL
- mysql-connector-python

---

# Project Structure

```text
german_dictionary/
│
├── main.py
├── web/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── README.md
```

---

# Database Setup

## Step 1: Create Database

```sql
CREATE DATABASE german_dictionary;
```

---

## Step 2: Use Database

```sql
USE german_dictionary;
```

---

## Step 3: Create Table

```sql
CREATE TABLE words (
    id INT AUTO_INCREMENT PRIMARY KEY,
    english_word VARCHAR(100),
    german_word VARCHAR(100)
);
```

---

# Install Required Module

Open terminal and run:

```bash
pip install mysql-connector-python
```

---

# Configure MySQL Password

Inside `main.py`, change:

```python
password="YOUR_PASSWORD"
```

to your actual MySQL password.

Example:

```python
password="root123"
```

---

# How to Run

Run the program using:

```bash
python main.py
```

---

# Application Menu

```text
1. Add Word
2. View Words
3. Search Word
4. Delete Word
5. Update Word
6. Quiz Mode
7. Exit
```

---

# Quiz Mode

The quiz mode continuously asks random translation questions until the user types:

```text
exit
```

Supports:
- English → German
- German → English

---

# Concepts Used

- Python Functions
- Loops
- Conditional Statements
- MySQL Database Connectivity
- SQL Queries
- CRUD Operations
- Random Module

---

# Future Improvements

Possible future upgrades:

- GUI using Tkinter
- Dark Mode
- Word Categories
- Score Tracking
- CSV Import/Export
- Audio Pronunciation

---

# Author

Anant Shrey

CBSE Class 12 Computer Science Project
