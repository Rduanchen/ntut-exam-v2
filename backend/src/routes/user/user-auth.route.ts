import { Router } from "express";
import { UserController } from "../../controllers/user/user.controller";

const userAuthRouter = Router();

// Retrieve RSA public key for cryptographic handshake
userAuthRouter.get("/rsa-public-key", UserController.getPublicKey);

// Register client hardware ID and exchange AES sessions
userAuthRouter.post("/register-device", UserController.registerDevice);

// Authenticate user credentials and bind device UUID
userAuthRouter.post("/login", UserController.login);

export default userAuthRouter;
