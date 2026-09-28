# Task 2 — Mini Social Media Platform

A full-stack mini social media app built with:

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express.js
- Database: MySQL
- Authentication: JWT + bcrypt

## Features

- User registration and login
- User profiles
- Create posts
- Delete own posts
- Like/unlike posts
- Comments
- Search users
- Follow/unfollow users
- Responsive UI

## 1. Requirements

Install:

- Node.js
- MySQL / MySQL Workbench

## 2. Database setup

Open MySQL Workbench and run the complete `schema.sql` file.

It creates:

- `users`
- `posts`
- `comments`
- `likes`
- `followers`

## 3. Install packages

Open terminal inside this project folder:

```bash
npm install
```

## 4. Environment file

Create a file named `.env` in the project root.

Copy `.env.example` into it and update your MySQL password:

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_PASSWORD
DB_NAME=social_media_db
JWT_SECRET=make_this_a_long_random_secret
```

## 5. Start the app

```bash
npm start
```

Then open:

http://localhost:5000

For development with auto-reload:

```bash
npm run dev
```

## Internship Task 2 checklist

This project covers all required points:

- User profiles
- Posts & comments
- Like/follow system
- HTML/CSS/JavaScript frontend
- Express.js backend
- MySQL database for users, posts, comments and followers

## Suggested demo

1. Register User A.
2. Create 2 posts.
3. Register User B in another browser/incognito window.
4. Search for User A.
5. Follow User A.
6. Like a post.
7. Add a comment.
8. Show the database tables in MySQL Workbench.
