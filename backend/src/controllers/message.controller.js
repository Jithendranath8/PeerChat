import User from "../models/user.model.js";
import Message from "../models/message.model.js";

import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");

    // compute unread counts per user
    const unreadCounts = await Message.aggregate([
      {
        $match: { receiverId: loggedInUserId, read: false },
      },
      {
        $group: { _id: "$senderId", count: { $sum: 1 } },
      },
    ]);

    const senderIdToCount = unreadCounts.reduce((acc, cur) => {
      acc[cur._id.toString()] = cur.count;
      return acc;
    }, {});

    // compute last message time between logged-in user and each contact
    const lastMessageTimes = await Message.aggregate([
      {
        $match: {
          $or: [
            { senderId: loggedInUserId },
            { receiverId: loggedInUserId },
          ],
        },
      },
      {
        $addFields: {
          otherUserId: {
            $cond: [
              { $eq: ["$senderId", loggedInUserId] },
              "$receiverId",
              "$senderId",
            ],
          },
        },
      },
      {
        $group: {
          _id: "$otherUserId",
          lastMessageAt: { $max: "$createdAt" },
        },
      },
    ]);

    const userIdToLastMessageAt = lastMessageTimes.reduce((acc, cur) => {
      acc[cur._id.toString()] = cur.lastMessageAt;
      return acc;
    }, {});

    const usersWithMeta = filteredUsers.map((u) => ({
      ...u.toObject(),
      unreadCount: senderIdToCount[u._id.toString()] || 0,
      lastMessageAt: userIdToLastMessageAt[u._id.toString()] || null,
    }));

    // sort by lastMessageAt desc; users with no messages go to the end
    usersWithMeta.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });

    res.status(200).json(usersWithMeta);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    });

    // mark messages sent by other user to me as read
    await Message.updateMany(
      { senderId: userToChatId, receiverId: myId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl;
    if (image) {
      // Upload base64 image to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
