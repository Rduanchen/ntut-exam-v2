# Backend Architecture & Directory Structure Documentation

This document outlines the file structure, configuration, and structural responsibilities of the backend service located in `host/backend`.

---

## Directory Structure Overview

```text
host/backend/
├── AGENT.md                 # Project architecture & directory responsibilities (this file)
├── package.json             # NPM dependencies & scripts (nodemon, ts-node, typescript, etc.)
├── tsconfig.json            # TypeScript configuration
├── dist/                    # Compiled JavaScript files (build target)
├── test/                    # Backend automated tests
└── src/                     # Source code directory
    ├── index.ts             # Main entry point (Server setup, db initialization, and sockets)
    ├── config/              # Application and environment configurations
    ├── controllers/         # Request handlers (extract arguments, invoke services, send responses)
    ├── middlewares/         # Express middlewares (authentication, request loggers, custom error handling)
    ├── models/              # Sequelize database model definitions
    ├── routes/              # Express API route declarations mapping endpoints to controllers
    ├── services/            # Core business logic and database interactions
    ├── sockets/             # Socket.io event listeners, handlers, and logic
    ├── types/               # TypeScript interface declarations and custom types
    └── utils/               # Shared helper functions and utility libraries
```

---

## Core Stack & Dependencies

The backend is built as a **TypeScript Node.js Application** utilizing the following core libraries:
* **Framework**: [Express]
* **Real-time communication**: [Socket.io]
* **Database / ORM**: [Sequelize]
* **Validation**: [Zod]

## Note:
1. use camelCase for variables and functions
2. use kebab-case for file names
3. use proper subfile naming convention (e.g. `*.service.ts`, `*.controller.ts`, `*.model.ts`, `*.route.ts`, `*.socket.ts`, `*.type.ts`, `*.util.ts`)
4. use [ESLint] for linting
5. use [Vitest] for testing
6. use [Sequelize] for ORM
7. use [Zod] for validation
8. use [Express] for routing
9. use [Socket.io] for real-time communication
10. use [SQLite] for database
11. add minimun comment for your code(following the clean code principle)
12. If you need to print out debug messeage, please use winstone as debugger and set level.
13. If functions happens expected Error, use HttpError(./src/utils/http-error.ts) for throwing errors. If that meas the application should shutdown, then throw Error.
14. Use only English to write the comments.

## Available Scripts
Run these scripts from the `host/backend` directory:
| Script | Command | Purpose |
|---|---|---|
| **`npm run dev`** | `nodemon --watch src --ext ts --exec ts-node src/index.ts` | Runs the server in development mode with live-reloading. |
| **`npm run build`** | `tsc` | Compiles the TypeScript code into JavaScript in the `/dist` directory. |
| **`npm run start`** | `node dist/index.js` | Runs the production-compiled JavaScript server. |
