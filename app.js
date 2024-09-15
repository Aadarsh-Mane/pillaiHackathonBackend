// const connectDB = require("./db");
// require("dotenv").config();
// const port = process.env.PORT;
const port = 3000;
import http from "http";
import express from "express";
import { connectDB } from "./db.js";
import userRouter from "./routes/userRoutes.js";
import communityRouter from "./routes/communityRoutes.js";
const app = express();
const server = http.createServer(app);
app.use(express.json());
connectDB();
app.use("/users", userRouter);
app.use("/build", communityRouter);
app.get("/", (req, res) => {
  res.send("hello world@");
});

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
