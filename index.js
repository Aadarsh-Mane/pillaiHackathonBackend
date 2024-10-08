// const connectDB = require("./db");
// require("dotenv").config();
// const port = process.env.PORT;
const port = 3000;
import http from "http";
import express from "express";
import { connectDB } from "./db.js";
import userRouter from "./routes/userRoutes.js";
import communityRouter from "./routes/communityRoutes.js";
import councilRoutes from "./routes/council.js";
import { socketHandler } from "./socket.js";
import { Server } from "socket.io";
import Faculty from "./models/pillaiFaculty.js";
import User from "./models/user.js";
import adminRouter from "./routes/admin.js";
import jwt from "jsonwebtoken";
import axios from "axios";

const SECRET = "PILLAI";

const app = express();
const server = http.createServer(app);

app.use(express.json());
connectDB();

app.use("/users", userRouter);
app.use(express.static("public"));

app.set("views", "views");
app.set("view engine", "ejs");
app.use("/build", communityRouter);
app.use("/council", councilRoutes);
app.use("/admin", adminRouter);
app.get("/", (req, res) => {
  res.send(
    `aai ghala changes adhich sangat java  mala 18 parent backend end krycha aahe m on a mission to find a  girl`
  );
});
app.get("/dashin", async (req, res) => {
  try {
    // Fetch data from API
    const response = await axios.get(
      "https://pillaihackathonbackend.onrender.com/admin/getFaculty"
    );
    const facultyData = response.data; // The response data

    // Render the EJS view, passing the data to the template
    res.render("index", { facultyData });
  } catch (error) {
    console.error("Error fetching faculty data:", error);
    res.status(500).send("Error fetching faculty data");
  }
});
app.get("/dash", (req, res) => {
  res.render("index"); // Render the "index.ejs" template
});
export const getFaculty = async (req, res) => {
  try {
    // Fetch all faculty members
    const facultyMembers = await Faculty.find();

    // Extract emails of all faculty members
    const facultyEmails = facultyMembers.map((faculty) => faculty.email);

    // Fetch users with the extracted faculty emails
    const facultyUsers = await User.find({ email: { $in: facultyEmails } });

    // Create a mapping of email to faculty details
    const facultyMapping = facultyMembers.reduce((acc, faculty) => {
      acc[faculty.email] = {
        department: faculty.department,
        subject: faculty.subject,
        experience: faculty.experience,
        gender: faculty.gender,
        profession: faculty.profession, // Assuming profession field exists
      };
      return acc;
    }, {});

    // Merge user profiles with faculty details
    const facultyProfiles = facultyUsers.map((user) => ({
      ...user.toObject(), // Spread the user fields
      ...facultyMapping[user.email], // Add the faculty-specific fields
    }));

    res.status(200).json(facultyProfiles);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
app.get("/faculty", getFaculty);
// Socket.io middleware and connection

// io.use(async (socket, next) => {
//   const token = socket.handshake.auth.token;
//   console.log(token);
//   if (token) {
//     try {
//       const decoded = jwt.verify(token, SECRET);
//       socket.userId = decoded.id;

//       // Fetch user details from the User model
//       const user = await User.findById(decoded.id).select("username imageUrl");
//       if (!user) {
//         return next(new Error("User not found"));
//       }

//       // Attach username and profileImage to the socket
//       socket.username = user.username;
//       socket.profileImage = user.imageUrl;

//       next();
//     } catch (error) {
//       console.error("Authentication error:", error);
//       return next(new Error("Authentication error"));
//     }
//   } else {
//     next(new Error("No token provided"));
//   }
// });

socketHandler(server);
server.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on http://localhost:${port}`);
});
