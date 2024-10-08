import cloudinary from "../helpers/cloudinary.js";
import Community from "../models/community.js";
import Event from "../models/communityEvents.js";
import Faculty from "../models/pillaiFaculty.js";
import Tag from "../models/trending.js";
import User from "../models/user.js"; // Import the User model
import mongoose from "mongoose";
export const createCommunity = async (req, res) => {
  const {
    name,
    description,
    facultyEmail,
    category, // Save the category
  } = req.body;
  const userId = req.userId; // Get userId from auth middleware
  const file = req.file; // Assuming the image is passed via multipart/form-data

  try {
    // Check for existing community
    const existingCommunity = await Community.findOne({ name });
    if (existingCommunity) {
      return res.status(400).json({ message: "Community already exists" });
    }

    // Fetch the username based on the userId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the provided facultyEmail is valid
    const faculty = await Faculty.findOne({ email: facultyEmail });
    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    // Fetch the user ID associated with this faculty email
    const facultyUser = await User.findOne({ email: faculty.email });
    if (!facultyUser) {
      return res.status(404).json({ message: "Faculty user not found" });
    }

    let imageUrl = "";
    if (file) {
      // Upload image directly to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.v2.uploader
          .upload_stream(
            {
              folder: "community_images",
              resource_type: "auto", // Automatically detect the file type
            },
            (error, result) => {
              if (error) {
                reject(new Error(error.message));
              } else {
                resolve(result);
              }
            }
          )
          .end(file.buffer); // Pass the buffer to Cloudinary
      });

      imageUrl = uploadResult.secure_url; // Save the image URL
    }

    // Create a new community
    const newCommunity = new Community({
      name,
      description,
      category, // Save the category

      creator: {
        userId,
        username: user.username,
      },
      members: [{ userId, username: user.username }],
      status: "pending", // Set status to 'pending' by default
      facultyId: facultyUser._id, // Store the user ID of the faculty
      imageUrl: imageUrl, // Save the image URL to the community
    });

    // Save to database
    await newCommunity.save();
    res.status(201).json(newCommunity);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const getUserCommunities = async (req, res) => {
  const userId = req.userId; // Get userId from auth middleware

  try {
    // Find all communities created by the user and populate the facultyId field from the User model to get the faculty's username
    const communities = await Community.find({ "creator.userId": userId })
      .populate({
        path: "facultyId",
        model: User, // Populate from User model
        select: "username", // Only select the username
      })
      .exec();
    if (!communities.length) {
      return res
        .status(404)
        .json({ message: "No communities found for this user" });
    }

    // Transform the response to include the faculty's username
    const response = communities.map((community) => ({
      ...community._doc,
      facultyUsername: community.facultyId?.username || null, // Add faculty username or null if not available
    }));

    res.status(200).json(response);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const approveCommunity = async (req, res) => {
  const { communityId, statusId } = req.params;
  const facultyId = req.userId; // Assuming the faculty ID is in req.userId
  console.log(facultyId);
  try {
    // Ensure status is either 'approved' or 'rejected'
    if (!["approved", "rejected"].includes(statusId)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Check if the facultyId is valid and is a registered faculty
    const faculty = await User.findById(facultyId);
    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    // Check if the community exists and if the facultyId matches the one stored in the Community document
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (community.facultyId.toString() !== facultyId.toString()) {
      return res
        .status(403)
        .json({ message: "Not authorized to approve this community" });
    }

    // Update the community status
    community.status = statusId;
    if (statusId === "approved") {
      community.approvedFaculty = facultyId;
    } else {
      community.approvedFaculty = null;
    }

    await community.save();

    res.status(200).json(community);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
// Assuming this function is part of your API controllers
export const getPendingCommunities = async (req, res) => {
  const facultyId = req.userId; // Get the faculty ID from auth middleware

  try {
    // Find communities with pending status and where the facultyId matches
    const communities = await Community.find({
      facultyId,
      status: "pending",
    }).select("name description creator status imageUrl"); // Adjust fields as needed

    if (communities.length === 0) {
      return res
        .status(404)
        .json({ message: "No communities pending approval" });
    }

    res.status(200).json(communities);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const getFacultyCommities = async (req, res) => {
  const facultyId = req.userId; // Assuming middleware attaches userId
  try {
    // Find all communities where the facultyId matches without populating faculty details
    const communities = await Community.find({ facultyId, status: "approved" });

    if (!communities.length) {
      return res
        .status(404)
        .json({ message: "No communities found for this faculty" });
    }

    res.status(200).json(communities);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};

// router.get('/communities/faculty', async (req, res) => {
// });

export const getUpcomingEvents = async (req, res) => {
  try {
    const today = new Date();
    // Fetch all approved events where the event date is greater than today's date
    const events = await Event.find({
      // date: { $gt: today },
      status: "pending", // Corrected to "approved" for upcoming events
    });

    // Process events to include participant details
    const processedEvents = events.map((event) => {
      const participantDetails = event.participants.map((participant) => ({
        userId: participant.userId,
        username: participant.username,
      }));

      return {
        ...event.toObject(), // Convert Mongoose document to plain object
        // participantDetails,
      };
    });

    // Respond with the events (without total participants)
    res.status(200).json({
      events: processedEvents,
    });
  } catch (error) {
    // Handle errors
    res.status(500).json({
      message: "Error fetching upcoming events",
      error: error.message,
    });
  }
};

// Get Ongoing Events
export const getOngoingEvents = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)); // Start of the current day
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)); // End of the current day

    // Fetch all approved events where the event date is within today's date range
    const events = await Event.find({
      date: {
        $gte: startOfDay, // Events from the start of today
        $lt: endOfDay, // Until the end of today
      },
      status: "pending", // Changed from "pending" to "approved" for ongoing events
    })
      .populate("community", "name") // Populate the community field to get the community name
      .exec();

    // Process events to include participant details and community name
    const processedEvents = events.map((event) => {
      const participantDetails = event.participants.map((participant) => ({
        userId: participant.userId,
        username: participant.username,
      }));

      return {
        ...event.toObject(), // Convert Mongoose document to plain object
        // participantDetails,
        communityName: event.community.name, // Extract community name
        location: event.location, // Include location in the response
      };
    });

    // Respond with the events (without total participants)
    res.status(200).json({
      events: processedEvents,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching ongoing events",
      error: error.message,
    });
  }
};

export const joinEvent = async (req, res) => {
  const { eventId } = req.params; // Get the event ID from URL params
  const userId = req.userId; // Get userId from the auth middleware

  try {
    // Fetch the event to check if it exists
    const event = await Event.findById(eventId).populate("community");
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Fetch the community associated with the event
    const community = await Community.findById(event.community._id);
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    // Check if the user is already a member of the community
    const isMember = community.members.some(
      (member) => member.userId.toString() === userId.toString()
    );

    // If the user is not a member, add them to the community
    if (!isMember) {
      const user = await User.findById(userId); // Fetch the user's username
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      community.members.push({
        userId: user._id,
        username: user.username,
      });

      await community.save(); // Save the updated community
    }

    // Check if the user has already joined the event
    const hasJoined = event.participants.some(
      (participant) => participant.userId.toString() === userId.toString()
    );

    if (hasJoined) {
      return res
        .status(400)
        .json({ message: "User has already joined this event" });
    }

    // Add the user to the event participants
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    event.participants.push({
      userId: user._id,
      username: user.username,
    });

    await event.save(); // Save the updated event with new participant

    // Generate a random ticket ID (e.g., CLD09738PL)
    const generateTicketId = () => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const digits = "0123456789";
      const randomChars = Array(3)
        .fill(null)
        .map(() => chars[Math.floor(Math.random() * chars.length)])
        .join("");
      const randomDigits = Array(5)
        .fill(null)
        .map(() => digits[Math.floor(Math.random() * digits.length)])
        .join("");
      return `CLD${randomDigits}${randomChars}`;
    };

    const ticketId = generateTicketId();

    // Generate a random date for the creation (within the last 7 days)
    const randomDate = new Date(
      Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
    );
    const time = "09:30 am";
    // Send the event details, ticket ID, and random date
    res.status(200).json({
      message: "Successfully joined the event!",
      ticketId: ticketId,
      createdAt: randomDate, // Send the random date and time
      time: time,
      eventDetails: {
        name: event.title,
        imageUrl: event.imageUrl,
        creator: {
          username: event.creator.username,
        },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};

export const getEnrolledEvents = async (req, res) => {
  try {
    const userId = req.userId; // Get userId from auth middleware
    const events = await Event.find({
      "participants.userId": userId,
      status: "pending",
    });

    if (!events.length) {
      return res.status(404).json({ message: "No enrolled events found" });
    }

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching enrolled events",
      error: error.message,
    });
  }
};

export const createEvent = async (req, res) => {
  const { title, description, communityId, date, location } = req.body;
  const userId = req.userId; // Get userId from auth middleware
  const file = req.file; // Assuming the image is passed via multipart/form-data
  console.log(title);
  console.log(userId);
  console.log(communityId);
  try {
    // Fetch the community to check if the user is the creator
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }
    if (community.status === "pending") {
      return res
        .status(403)
        .json({ message: "Only approved communities can create events" });
    }
    // Ensure the user is the creator of the community
    if (community.creator.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Only the community creator can create events" });
    }

    // Fetch the user's username
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    let imageUrl = "";
    if (file) {
      // Upload image directly to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.v2.uploader
          .upload_stream(
            {
              folder: "event_images",
              resource_type: "auto", // Automatically detect the file type
            },
            (error, result) => {
              if (error) {
                reject(new Error(error.message));
              } else {
                resolve(result);
              }
            }
          )
          .end(file.buffer); // Pass the buffer to Cloudinary
      });

      imageUrl = uploadResult.secure_url; // Save the image URL
    }
    const newEvent = new Event({
      title,
      description,
      community: communityId,
      creator: {
        userId,
        username: user.username,
      },
      date: new Date(date), // Store the event date
      location: location,
      status: "pending", // Set status to 'pending' by default
      imageUrl: imageUrl, // Save the image URL to the event, if provided by the user
      participants: [], // Initialize participants as an empty array
    });

    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const updateEvent = async (req, res) => {
  const { eventId } = req.params; // Event ID from the request parameters
  const { title, description } = req.body;
  const userId = req.userId; // Get userId from auth middleware
  const file = req.file; // Assuming the image is passed via multipart/form-data

  try {
    // Find the event by ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Ensure the user is the creator of the event
    if (event.creator.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Only the event creator can update the event" });
    }

    // If there's a file, upload it to Cloudinary
    let imageUrl = event.imageUrl; // Retain old image URL if no new image is provided
    if (file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.v2.uploader
          .upload_stream(
            {
              folder: "event_images",
              resource_type: "auto",
            },
            (error, result) => {
              if (error) {
                reject(new Error(error.message));
              } else {
                resolve(result);
              }
            }
          )
          .end(file.buffer);
      });

      imageUrl = uploadResult.secure_url;
    }

    // Update the event fields
    event.title = title || event.title;
    event.description = description || event.description;
    event.imageUrl = imageUrl;

    await event.save(); // Save the updated event

    res.status(200).json(event);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const deleteEvent = async (req, res) => {
  const { eventId } = req.params; // Event ID from the request parameters
  const userId = req.userId; // Get userId from auth middleware

  try {
    // Find the event by ID
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Ensure the user is the creator of the event
    if (event.creator.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Only the event creator can delete the event" });
    }

    // Delete the event
    await event.deleteOne();

    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const getEventsByCommunity = async (req, res) => {
  const { communityId } = req.params;

  try {
    // Find events associated with the provided communityId
    const events = await Event.find({ community: communityId })
      .populate("community", "name") // Populate community name
      .populate("creator.userId", "username imageUrl"); // Populate creator details

    if (events.length === 0) {
      return res
        .status(404)
        .json({ message: "No events found for this community." });
    }

    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching events for the community:", error);
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const getUserCreatedEvents = async (req, res) => {
  const userId = req.userId; // Get userId from auth middleware

  try {
    // Fetch all events where the creator's userId matches the current user
    const events = await Event.find({ "creator.userId": userId });

    // If no events found, return an empty array
    if (!events.length) {
      return res.status(404).json({ message: "No events found" });
    }

    res.status(200).json(events); // Return the events created by the user
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const getAllEvents = async (req, res) => {
  try {
    // Fetch all events from the database
    const events = await Event.find()
      .populate("community", "name") // Populate community name
      .populate("creator.userId", "username imageUrl"); // Populate creator details

    if (events.length === 0) {
      return res.status(404).json({ message: "No events found." });
    }

    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching all events:", error);
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const approveEvent = async (req, res) => {
  const { eventId, status } = req.body;
  const facultyId = req.userId; // Get facultyId from auth middleware (assumed to be logged in faculty)

  try {
    // Ensure status is either 'approved' or 'rejected'
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Find the community related to this event
    const community = await Community.findById(event.community);
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    // Check if the current faculty is the one who approved the community
    if (community.approvedFaculty.toString() !== facultyId) {
      return res.status(403).json({
        message:
          "Only the faculty who approved the community can approve the event",
      });
    }

    // Update the event status
    event.status = status;
    await event.save();

    res.status(200).json(event);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const updateCommunity = async (req, res) => {
  const { communityId } = req.params; // Get community ID from request parameters
  console.log("Community ID from params:", communityId);

  if (!mongoose.Types.ObjectId.isValid(communityId)) {
    return res.status(400).json({ message: "Invalid community ID" });
  }

  const { name, description } = req.body; // Get updated fields from request body
  const userId = req.userId; // Get userId from auth middleware
  const file = req.file; // Get the uploaded image file (if any)

  try {
    const community = await Community.findById(communityId);
    console.log("Community found:", community);

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (community.creator.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this community" });
    }

    if (name) community.name = name;
    if (description) community.description = description;

    if (file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.v2.uploader
          .upload_stream(
            {
              folder: "community_images",
              resource_type: "auto",
            },
            (error, result) => {
              if (error) {
                reject(new Error(error.message));
              } else {
                resolve(result);
              }
            }
          )
          .end(file.buffer);
      });

      community.imageUrl = uploadResult.secure_url;
    }

    await community.save(); // Save changes to the database

    res.status(200).json(community);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};

export const deleteCommunity = async (req, res) => {
  const { communityId } = req.params; // Get community ID from request parameters
  const userId = req.userId; // Get userId from auth middleware

  // Check if communityId is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(communityId)) {
    return res.status(400).json({ message: "Invalid community ID" });
  }

  try {
    // Find the community by ID
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    // Check if the current user is the creator of the community
    if (community.creator.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this community" });
    }

    // Delete the community
    await Community.findByIdAndDelete(communityId);

    // Send a success response
    res.status(200).json({ message: "Community deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};

export const joinCommunity = async (req, res) => {
  const { communityId } = req.params;
  const userId = req.userId; // Get userId from auth middleware
  console.log(communityId);
  try {
    const community = await Community.findById(communityId);

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (community.members.some((member) => member.userId.equals(userId))) {
      return res.status(400).json({ message: "Already a member" });
    }

    // Fetch the username based on the userId
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    community.members.push({ userId, username: user.username });

    await community.save();

    res.status(200).json({ message: "Joined community successfully" });
  } catch (error) {
    res.status(500).json({ message: "Something went wrong" });
  }
};
export const listCommunitiesNotJoined = async (req, res) => {
  const userId = req.userId; // Get userId from auth middleware

  try {
    // Fetch all communities
    const allCommunities = await Community.find();

    // Fetch the user's communities
    const userCommunities = await Community.find({
      "members.userId": userId,
    });

    // Extract the IDs of communities the user is a member of
    const userCommunityIds = userCommunities.map((community) =>
      community._id.toString()
    );

    // Filter out communities the user is a member of
    const communitiesNotJoined = allCommunities.filter(
      (community) => !userCommunityIds.includes(community._id.toString())
    );

    res.status(200).json(communitiesNotJoined);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const getJoinedCommunities = async (req, res) => {
  const userId = req.userId; // Get userId from the auth middleware

  try {
    // Find communities where the user is a member and include posts and their tags
    let joinedCommunities = await Community.find({ "members.userId": userId })
      .select("name description imageUrl createdAt status posts creator") // Include creator
      .populate({
        path: "posts.tags", // Populate the tags inside the posts
        select: "name", // Only return the 'name' field of the tags
      })
      .populate({
        path: "creator.userId", // Populate the creator's userId from the User model
        select: "username", // Get the username of the creator
      })
      .exec();

    if (!joinedCommunities.length) {
      return res
        .status(404)
        .json({ message: "User has not joined any communities." });
    }

    // Modify the response to remove the extra _id field inside creator.userId
    joinedCommunities = joinedCommunities.map((community) => {
      if (community.creator && community.creator.userId) {
        community.creator.userId = community.creator.userId._id; // Set userId to the value of _id
      }
      return community;
    });

    res.status(200).json(joinedCommunities);
  } catch (error) {
    res.status(500).json({ message: "Something went wrong" });
  }
};

// export const getJoinedCommunities = async (req, res) => {
//   const userId = req.userId; // Get userId from the auth middleware

//   try {
//     // Find communities where the user is a member and include posts
//     const joinedCommunities = await Community.find({ "members.userId": userId })
//       .select("name description imageUrl createdAt status posts")
//       .exec();

//     if (!joinedCommunities.length) {
//       return res
//         .status(404)
//         .json({ message: "User has not joined any communities." });
//     }

//     res.status(200).json(joinedCommunities);
//   } catch (error) {
//     res.status(500).json({ message: "Something went wrong" });
//   }
// };

export const leaveCommunity = async (req, res) => {
  const { communityId } = req.body; // The community the user wants to leave
  const userId = req.userId; // Get userId from auth middleware

  try {
    const community = await Community.findById(communityId);

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    // Check if the user is a member of the community
    const isMember = community.members.some((member) =>
      member.userId.equals(userId)
    );
    if (!isMember) {
      return res
        .status(400)
        .json({ message: "User is not a member of the community" });
    }

    // Remove the user from the community members array
    community.members = community.members.filter(
      (member) => !member.userId.equals(userId)
    );

    await community.save();

    res.status(200).json({ message: "Left the community successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const getPostsByCommunity = async (req, res) => {
  const { communityId } = req.params;

  try {
    // Find the community by ID and populate the posts with tag details
    const community = await Community.findById(communityId)
      .populate({
        path: "posts",
        populate: {
          path: "tags", // Populate the tags field within posts
          select: "name", // Select fields to include in the response
        },
      })
      .populate({
        path: "posts.author.id",
        select: "username", // Optional: include username of the post author
      });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    // Get all posts of the community
    const posts = community.posts;

    if (!posts.length) {
      return res
        .status(404)
        .json({ message: "No posts found for this community" });
    }

    // Return the posts with tag details
    res.status(200).json(posts);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
// get posts with tags
// export const getPostsByCommunity = async (req, res) => {
//   const { communityId } = req.params;

//   try {
//     // Find the community by ID and populate the posts with tag details
//     const community = await Community.findById(communityId)
//       .populate({
//         path: "posts",
//         populate: {
//           path: "tags", // Populate the tags field within posts
//           select: "name", // Select fields to include in the response
//         },
//       })
//       .populate({
//         path: "posts.author.id",
//         select: "username", // Optional: include username of the post author
//       });

//     if (!community) {
//       return res.status(404).json({ message: "Community not found" });
//     }

//     // Get all posts of the community
//     const posts = community.posts;

//     if (!posts.length) {
//       return res
//         .status(404)
//         .json({ message: "No posts found for this community" });
//     }

//     // Return the posts with tag details
//     res.status(200).json(posts);
//   } catch (error) {
//     res
//       .status(500)
//       .json({ message: "Something went wrong", error: error.message });
//   }
// };

export const listCommunities = async (req, res) => {
  const { page = 1, limit = 10 } = req.query; // Default page is 1, limit is 10 communities per page

  try {
    // Calculate the number of documents to skip
    // const skip = (page - 1) * limit;

    // Retrieve communities with pagination
    const communities = await Community.find().select(
      "name description creator createdAt, imageUrl status"
    );
    // .skip(skip)
    // .limit(parseInt(limit)); // Adjust the fields as needed

    // Get the total count of communities for pagination info
    const total = await Community.countDocuments();

    // Check if there are no communities
    if (communities.length === 0) {
      return res.status(404).json({ message: "No communities found" });
    }

    // Return the list of communities with pagination info
    res.status(200).json({
      // total, // Total number of communities
      // page: parseInt(page), // Current page
      // totalPages: Math.ceil(total / limit), // Total pages based on limit
      communities, // Communities for the current page
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const listCommunitiesMembers = async (req, res) => {
  const { page = 1, limit = 10 } = req.query; // Default page is 1, limit is 10 communities per page
  const { commmunityId } = req.params;
  try {
    // Calculate the number of documents to skip
    const skip = (page - 1) * limit;

    // Retrieve communities with pagination
    const communities = await Community.findById(commmunityId)
      .select("name description creator createdAt  ")
      .populate({
        path: "members.userId", // Populate member user details
        select: "username imageUrl", // Include username and imageUrl of the members
      })
      .skip(skip)
      .limit(parseInt(limit)); // Adjust the fields as needed

    // Get the total count of communities for pagination info
    const total = await Community.countDocuments();
    // Check if there are no communities
    if (communities.length === 0) {
      return res.status(404).json({ message: "No communities found" });
    }

    // Return the list of communities with pagination info
    const totalMembers = communities.members.length;

    res.status(200).json({
      // total, // Total number of communities
      // page: parseInt(page), // Current page
      // totalPages: Math.ceil(total / limit), // Total pages based on limit
      communities, // Communities for the current page
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const getTrendingTags = async (req, res) => {
  try {
    const trendingTags = await Tag.find().sort({ usageCount: -1 }).limit(10); // Get top 10 tags

    res.status(200).json(trendingTags);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
export const getCommunityPostsAndEvents = async (req, res) => {
  const userId = req.userId; // Get userId from auth middleware

  try {
    // Fetch the communities the user has joined
    const communities = await Community.find({
      "members.userId": userId,
      status: "approved",
    }).populate("posts");
    console.log(communities);
    if (!communities || communities.length === 0) {
      return res.status(404).json({ message: "No joined communities found" });
    }

    // Fetch the events for the joined communities
    const communityIds = communities.map((community) => community._id);
    const events = await Event.find({
      community: { $in: communityIds },
      status: "approved",
    });

    res.status(200).json({ communities, events });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong", error: error.message });
  }
};
