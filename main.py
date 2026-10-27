# German Dictionary Project
# Python + MySQL connectivity
# By Anant Shrey

import mysql.connector as msc
import random

# Connection and cursor
# ---------------------------------------------------------------
con = msc.connect(host='localhost', user='root', password='root1234')
cur = con.cursor()

cur.execute("CREATE DATABASE IF NOT EXISTS german")
cur.execute("USE german")

# Tables creation
# ---------------------------------------------------------------
def table_creation():
    cur.execute("""
        CREATE TABLE IF NOT EXISTS words (
            word_id         INT AUTO_INCREMENT PRIMARY KEY,
            german          VARCHAR(100) NOT NULL,
            english         VARCHAR(100) NOT NULL)
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id   INT AUTO_INCREMENT PRIMARY KEY,
            username  VARCHAR(30) NOT NULL UNIQUE,
            password  VARCHAR(30) NOT NULL)
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS quiz_history (
            attempt_id  INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT NOT NULL,
            word_id     INT NOT NULL,
            correct     TINYINT(1) NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(user_id),
            FOREIGN KEY (word_id) REFERENCES words(word_id))
    """)


# Helper functions
# ---------------------------------------------------------------
def ask_int(prompt):
    # keeps asking until the user enters a whole number
    while True:
        try:
            return int(input(prompt))
        except ValueError:
            print("Please enter a number.")

def show_rows(rows):
    # prints rows of the words table
    print("\nid | german | english")
    print("-" * 21)
    for row in rows:
        values = []
        for v in row:
            values.append(str(v))
        print(" | ".join(values))
    print(f"\n{str(len(rows))} word(s) found")


# Register and login
# ---------------------------------------------------------------
def register():
    print("\nRegister")
    username = input("Choose a username: ").strip()
    password = input("Choose a password: ").strip()

    if username == "" or password == "":
        print("\nUsername and password can't be empty")
        return

    try:
        cur.execute("INSERT INTO users (username, password) VALUES (%s, %s)", (username, password))
        con.commit()
        print("\nRegistered successfully. You can log in now.")
    except msc.Error:
        print("\nCould not register (username may already exist)")

def login():
    # returns user_id if login is correct, otherwise None
    print("\nLogin")
    username = input("Username: ").strip()
    password = input("Password: ").strip()

    cur.execute("SELECT user_id FROM users WHERE username = %s AND password = %s", (username, password))
    row = cur.fetchone()

    if row is None:
        print("\nWrong username or password.")
        return None
    print("\n\nWelcome, " + username + "!")
    return row[0]

def login_menu():
    # keeps showing the menu until the user logs in or exits
    while True:
        print("\n1. Login")
        print("2. Register")
        print("0. Exit")
        choice = ask_int("\nInput: ")

        if choice == 1:
            user_id = login()
            if user_id is not None:
                return user_id
        elif choice == 2:
            register()
        elif choice == 0:
            return None
        else:
            print("unexpected input")

    
# Dictionary functions
# ---------------------------------------------------------------
def view_words():
    print("\n\nViewing words")

    cur.execute("SELECT * FROM words")
    rows = cur.fetchall()

    if not rows:
        print("No words found.")
    else:
        show_rows(rows)

def add_word():
    print("\n\nAdding words")

    english = input("\nEnter English word: ").strip()
    german = input("Enter German word: ").strip()

    if not english or not german:
        print("\nBoth words are required.")
        return

    query = "INSERT INTO words (english, german) VALUES (%s, %s)"
    values = (english, german)

    cur.execute(query, values)
    con.commit()

    print("\nWord added successfully!")

def search_words():
    print("\n\nSearching words")

    print("\n1. Word ID")
    print("2. German word")
    print("3. English word")

    search_cols = {1: 'word_id', 2: 'german', 3: 'english'}

    choice = ask_int("\nSearch by: ")
    if choice not in search_cols:
        print("unexpected input")
        return

    if choice == 1:
        w_id = ask_int("Search for: ")
        sql = "SELECT * FROM words WHERE word_id = %s"
        cur.execute(sql, (w_id,))
    else:
        text = input("Search for: ").strip()
        sql = "SELECT * FROM words WHERE " + search_cols[choice] + " LIKE %s"
        cur.execute(sql, ("%" + text + "%",))
    rows = cur.fetchall()

    if not rows:
        print("No words found.")
    else:
        show_rows(rows)

def update_words():
    print("\n\nUpdating words")

    word_id = ask_int("\nEnter the word id to update: ")
    cur.execute("SELECT * FROM words WHERE word_id = %s", (word_id,))

    if cur.fetchone() is None:
        print("No matching word found.")
        return

    print("Word found. Enter the new details.")

    english = input("\nEnter English word: ").strip()
    german = input("Enter German word: ").strip()

    sql = "UPDATE words SET german = %s, english = %s WHERE word_id = %s"

    try:
        cur.execute(sql, (german,english,word_id))
        con.commit()
        print("\nWord updated.")
    except msc.Error:
        print("\nCould not update word")

def delete_words():
    print("\n\nDeleting words")

    word_id = ask_int("Enter the word id to delete: ")
    cur.execute("SELECT * FROM words WHERE word_id = %s", (word_id,))

    if cur.fetchone() is None:
        print("No matching word found.")
        return

    sure = input("\nAre you sure? (y/n): ").strip().lower()
    if sure != 'y':
        print("Cancelled.")
        return

    try:
        cur.execute("DELETE FROM words WHERE word_id = %s", (word_id,))
        con.commit()
        print("\nWord deleted.")
    except msc.Error:
        print("\nCould not delete word")


# Quiz functions
# ---------------------------------------------------------------
def quiz(user_id):
    print("\n\nQuiz mode")

    cur.execute("SELECT word_id, german, english FROM words")
    rows = cur.fetchall()

    if not rows:
        print("No words found.")
        return
    
    print("\n1. English to German")
    print("2. German to English")

    mode = ask_int("\nChoose mode: ")
    if mode != 1 and mode != 2:
        print("unexpected input")
        return

    print("\nType '/exit' to stop the quiz.\n")

    score = 0
    total = 0

    random.shuffle(rows)

    for i in range(len(rows)+1):
        if i == len(rows):
            print("No words left.")   
            break     

        if mode == 1:
            question = rows[i][2]       # english
            answer = rows[i][1]         # german
        else:
            question = rows[i][1]
            answer = rows[i][2]

        user_answer = input(f"Translate {question}: ").strip()
        if user_answer.lower() == '/exit':
            break

        total += 1
        if user_answer.lower() == answer.lower():
            print("Correct!\n")
            score += 1
            correct = 1
        else:
            print(f"Wrong. The answer is: {answer}\n")
            correct = 0

        cur.execute("INSERT INTO quiz_history (user_id, word_id, correct) VALUES (%s, %s, %s)", (user_id, rows[i][0], correct))
        con.commit()

    print("\nYour score: " + str(score) + " / " + str(total))

def my_stats(user_id):
    print("\n\nMy quiz stats")

    cur.execute("SELECT COUNT(*), SUM(correct) FROM quiz_history WHERE user_id = %s", (user_id,))
    row = cur.fetchone()

    total = int(row[0])

    if total == 0:
        print("\nYou have not taken any quiz yet.")
        return
    
    correct = int(row[1])

    print("\nQuestions attempted: " + str(total))
    print("Correct answers: " + str(correct))
    print(f"Accuracy: {(correct * 100 / total):.2f}%")

    # top 5 most-missed words (JOIN of two tables)
    cur.execute("""
        SELECT w.german, w.english, COUNT(*)
        FROM quiz_history q JOIN words w ON q.word_id = w.word_id
        WHERE q.user_id = %s AND q.correct = 0
        GROUP BY w.word_id, w.german, w.english
        ORDER BY COUNT(*) DESC
        LIMIT 5
    """, (user_id,))
    rows = cur.fetchall()

    if rows:
        print("\nYour weak words:")
        for r in rows:
            print(f"{r[0]} = {r[1]} (wrong {r[2]} times)")


# Main function
# ---------------------------------------------------------------
def main():
    table_creation()

    print("\nWelcome to 'german_dictionary'")
    print("By Anant Shrey")

    user_id = login_menu()
    if user_id is None:
        con.close()
        print("\nGoodbye!")
        return
    
    while True:
        print("\n1. View Words")
        print("2. Add Word")
        print("3. Search Word")
        print("4. Update Word")
        print("5. Delete Word")
        print("6. Quiz")
        print("7. My stats")
        print("0. Exit")

        choice = ask_int("\nInput: ")
        
        if choice == 1:
            view_words()
        elif choice == 2:
            add_word()
        elif choice == 3:
            search_words()
        elif choice == 4:
            update_words()
        elif choice == 5:
            delete_words()
        elif choice == 6:
            quiz(user_id)
        elif choice == 7:
            my_stats(user_id)
        elif choice == 0:
            break
        else:
            print("unexpected input")

    con.close()
    print("\nGoodbye!")

if __name__ == "__main__":
    main()