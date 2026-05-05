# BeSchool Management System

A comprehensive school management web application built with Node.js, Express, and SQLite. This system handles student admissions, teacher management, and fee submission tracking with a secure admin dashboard.

## 📁 Project Structure

The project is organized into a clean separation of concerns:

### [frontend/](frontend/)
Contains all client-side assets and UI files:
- **HTML Pages**: `index.html`, `about.html`, `admissions.html`, `teachers.html`, `fees.html`, `contact.html`, `admin-login.html`.
- **Styling**: `style.css` (custom modern CSS).
- **Assets**: `photos/` (UI images and icons).

### [backend/](backend/)
Contains the server-side logic and data:
- **`server.js`**: Main Express server handling routing, authentication, and API endpoints.
- **`admissions.db`**: SQLite database storing admissions, teachers, and payments.
- **`uploads/`**: Directory for user-uploaded files (teacher photos, payment receipts).
- **`scripts/`**: Utility scripts like `seed_teachers.js`.
- **`.env`**: Environment variables for configuration and security.

## 🚀 Key Features

### 1. Admissions System
- Online admission form for prospective students.
- Data validation and secure storage in SQLite.
- Admin view to manage and review all applications.

### 2. Teacher Management
- Dynamic teacher listing page.
- Admin CRUD (Create, Read, Update, Delete) functionality.
- Image upload support for teacher profile photos.

### 3. Fee Submission Tracking
- Public fee payment information with QR code.
- Receipt upload form for students to submit proof of payment.
- Secure admin portal to verify and track submitted receipts.

### 4. Admin Dashboard
- Protected by secure session-based authentication (Bcrypt hashing).
- Real-time statistics on admissions.
- Search and filter capabilities for student records.
- Rate-limiting on login to prevent brute-force attacks.

## 🛠️ Setup & Installation

### Prerequisites
- Node.js installed on your system.

### Installation
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your environment variables in `.env`:
   - `ADMIN_USER`: Admin username
   - `ADMIN_PASSWORD_HASH`: Bcrypt hash of the admin password
   - `SESSION_SECRET`: A secure string for session encryption
   - `PORT`: Port number (default: 3003)

### Running the Application
From the root directory, run:
```bash
node backend/server.js
```
The application will be available at `http://localhost:3003`.

## 🔒 Security Features
- **Bcrypt**: All admin passwords are saved as secure hashes.
- **Express Session**: Secure session management for admin access.
- **Rate Limiting**: Protection against login brute-force attempts.
- **File Validation**: Multer configuration restricts file types and sizes (max 2MB).
- **Static Protection**: Blocking direct access to `.db` files.

## 📜 License
© 2026 BeSchool. All rights reserved.
