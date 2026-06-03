# NTUT Exam Host Backend

This is the backend service for the NTUT Exam Host platform. It is built using Node.js, Express, TypeScript, and utilizes Socket.IO for real-time bidirectional communication.

## Features

- **Express REST API**: Core backend functionality, providing separate routing for `/user` and `/admin`.
- **Socket.IO Real-time Events**:
  - `admin` namespace: Listens for score updates and real-time violation alerts.
  - `user` namespace: Binds user device connections, tracks online status, and handles configuration broadcast notifications.
- **SQLite Database**: Uses Sequelize ORM to manage state such as exam configurations, test submissions, and users mapping.

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Create a `.env` file in the root directory (you can copy values as needed). By default, the app uses port `3000`.

3. **Development**
   Run the backend in development mode with hot-reloading:
   ```bash
   npm run dev
   ```

4. **Build and Production**
   Compile TypeScript to JavaScript and start the server:
   ```bash
   npm run build
   npm start
   ```

## Scripts

- `npm run dev`: Starts the nodemon server for local development.
- `npm run build`: Compiles the TypeScript code into the `dist` folder.
- `npm start`: Starts the application from the compiled `dist` directory.
- `npm run lint`: Lints the codebase.
- `npm run test`: Runs unit tests via Vitest.
