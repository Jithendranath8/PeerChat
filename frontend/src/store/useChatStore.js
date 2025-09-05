import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isSending: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
      // after fetching messages, clear unread count for this user locally
      set({
        users: get().users.map((u) =>
          u._id === userId ? { ...u, unreadCount: 0 } : u
        ),
      });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isMessagesLoading: false });
    }
  },
  sendMessage: async (messageData) => {
    const { selectedUser, messages, isSending } = get();
    if (isSending) return;
    set({ isSending: true });
    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      const newMsg = res.data;
      set({ messages: [...messages, newMsg] });

      // update users list: move selected user to top and set lastMessageAt
      set({
        users: (() => {
          const updated = get().users.map((u) =>
            u._id === selectedUser._id ? { ...u, lastMessageAt: newMsg.createdAt } : u
          );
          updated.sort((a, b) => {
            const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return tb - ta;
          });
          return updated;
        })(),
      });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isSending: false });
    }
  },

  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.off("newMessage");
    socket.on("newMessage", (newMessage) => {
      const currentSelected = get().selectedUser;
      const incomingSenderId = String(newMessage.senderId);
      const isFromSelectedUser =
        currentSelected && String(currentSelected._id) === incomingSenderId;
      if (isFromSelectedUser) {
        set({ messages: [...get().messages, newMessage] });
      } else {
        set({
          users: (() => {
            const updated = get().users.map((u) =>
              String(u._id) === incomingSenderId
                ? {
                    ...u,
                    unreadCount: (u.unreadCount || 0) + 1,
                    lastMessageAt: newMessage.createdAt,
                  }
                : u
            );
            updated.sort((a, b) => {
              const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
              const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
              return tb - ta;
            });
            return updated;
          })(),
        });
      }
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket && socket.off("newMessage");
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
