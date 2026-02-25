/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Heart, 
  MessageSquare, 
  Sparkles, 
  Send, 
  BookOpen, 
  User, 
  Clock,
  Loader2,
  ChevronRight,
  Settings,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import Markdown from "react-markdown";
import { formatDistanceToNow } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Story {
  id: number;
  title: string;
  content: string;
  author: string;
  likes: number;
  created_at: string;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [stories, setStories] = useState<Story[]>([]);
  const [isWriting, setIsWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authorizedUrl, setAuthorizedUrl] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempUrl, setTempUrl] = useState("");

  useEffect(() => {
    fetchStories();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.authorized_url) {
        setAuthorizedUrl(data.authorized_url);
        setTempUrl(data.authorized_url);
      }
    } catch (err) {
      console.error("Failed to fetch settings", err);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorized_url: tempUrl }),
      });
      if (res.ok) {
        setAuthorizedUrl(tempUrl);
        setIsSettingsOpen(false);
        alert("Settings updated successfully!");
      }
    } catch (err) {
      console.error("Failed to save settings", err);
    }
  };

  const isUrlAuthorized = () => {
    if (!isSharedUrl) return true; // Always authorized on dev URL
    if (!authorizedUrl) return false;
    
    const normalize = (url: string) => url.replace(/\/+$/, "").toLowerCase();
    const currentOrigin = normalize(window.location.origin);
    const targetUrl = normalize(authorizedUrl);
    
    return currentOrigin === targetUrl || window.location.href.toLowerCase().startsWith(targetUrl);
  };

  const fetchStories = async () => {
    try {
      const res = await fetch("/api/stories");
      const data = await res.json();
      setStories(data);
    } catch (err) {
      console.error("Failed to fetch stories", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content || !author) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, author }),
      });
      if (res.ok) {
        setTitle("");
        setContent("");
        setIsWriting(false);
        fetchStories();
      }
    } catch (err) {
      console.error("Failed to post story", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLike = async (id: number) => {
    try {
      const res = await fetch(`/api/stories/${id}/like`, { method: "POST" });
      if (res.ok) {
        const updatedStory = await res.json();
        setStories(stories.map(s => s.id === id ? updatedStory : s));
      }
    } catch (err) {
      console.error("Failed to like story", err);
    }
  };

  const generateAIAssistance = async () => {
    if (!title && !content) return;
    if (!isUrlAuthorized()) {
      alert("This URL is not authorized for AI features. Please configure the Authorized URL in settings (Owner only).");
      return;
    }
    setIsGenerating(true);
    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await genAI.models.generateContent({
        model: "gemini-flash-latest",
        contents: `I am writing a story titled "${title}". Here is what I have so far: "${content}". Can you help me expand this story or give me some creative ideas to continue? Please provide the response in a short, inspiring way.`,
      });
      const aiText = response.text;
      if (aiText) {
        setContent(prev => prev + "\n\n---\n*AI Suggestion:*\n" + aiText);
      }
    } catch (err: any) {
      console.error("AI Generation failed", err);
      alert(`Failed to generate AI suggestion: ${err?.message || "Connection error"}. Please try again.`);
    } finally {
      setIsGenerating(false);
    }
  };

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [messageCount, setMessageCount] = useState(() => {
    const saved = localStorage.getItem("katha_chat_limit");
    return saved ? parseInt(saved, 10) : 0;
  });

  // Detect if we are on the shared (preview) URL
  const isSharedUrl = window.location.hostname.includes("-pre-");
  const CHAT_LIMIT = 3;

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    if (!isUrlAuthorized()) {
      setChatMessages(prev => [...prev, { role: "ai", text: "This URL is not authorized for AI features. Please configure the Authorized URL in settings (Owner only)." }]);
      setChatInput("");
      return;
    }

    // Only apply limit on shared URL
    if (isSharedUrl && messageCount >= CHAT_LIMIT) {
      setChatMessages(prev => [...prev, { role: "ai", text: "Limit reached. You can only send 3 messages to the Katha Assistant in the shared version." }]);
      setChatInput("");
      return;
    }

    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { role: "user", text: userMessage }]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      // Re-initialize to ensure fresh API key context
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await genAI.models.generateContent({
        model: "gemini-flash-latest",
        contents: userMessage,
        config: {
          systemInstruction: "You are a helpful assistant for a story writing app called Katha. Keep your answers brief and helpful.",
        }
      });
      
      const aiText = response.text;
      if (aiText) {
        setChatMessages(prev => [...prev, { role: "ai", text: aiText }]);
        
        if (isSharedUrl) {
          const newCount = messageCount + 1;
          setMessageCount(newCount);
          localStorage.setItem("katha_chat_limit", newCount.toString());
        }
      }
    } catch (err: any) {
      console.error("Chat failed", err);
      const errorMessage = err?.message || "Connection error";
      setChatMessages(prev => [...prev, { role: "ai", text: `Sorry, I'm having trouble connecting: ${errorMessage}. Please try again.` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 selection:bg-stone-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-serif font-bold tracking-tight">Katha</h1>
          </div>
          <div className="flex items-center gap-3">
            {!isSharedUrl && (
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-stone-400 hover:text-stone-900 transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={() => setIsWriting(!isWriting)}
              className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm"
            >
            {isWriting ? "View Feed" : (
              <>
                <Plus className="w-4 h-4" />
                Write Story
              </>
            )}
          </button>
        </div>
      </div>
    </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {isWriting ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200"
            >
              <h2 className="text-2xl font-serif font-bold mb-6">Write your masterpiece</h2>
              <form onSubmit={handlePost} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Your Name</label>
                  <input 
                    type="text" 
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Who is the author?"
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Story Title</label>
                  <input 
                    type="text" 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Give your story a name..."
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all font-serif text-lg"
                    required
                  />
                </div>
                <div className="relative">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Content</label>
                  <textarea 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Once upon a time..."
                    rows={10}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all resize-none leading-relaxed"
                    required
                  />
                  <button
                    type="button"
                    onClick={generateAIAssistance}
                    disabled={isGenerating || (!title && !content)}
                    className="absolute bottom-4 right-4 p-2 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50"
                    title="Get AI Help"
                  >
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  </button>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsWriting(false)}
                    className="px-6 py-3 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 bg-stone-900 text-white px-8 py-3 rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors shadow-md disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Publish Story
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                  <p className="text-stone-500 font-medium">Gathering stories...</p>
                </div>
              ) : stories.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-stone-300">
                  <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-8 h-8 text-stone-400" />
                  </div>
                  <h3 className="text-xl font-serif font-bold mb-2">No stories yet</h3>
                  <p className="text-stone-500 mb-6">Be the first one to share a tale.</p>
                  <button 
                    onClick={() => setIsWriting(true)}
                    className="bg-stone-900 text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-colors"
                  >
                    Start Writing
                  </button>
                </div>
              ) : (
                stories.map((story, idx) => (
                  <motion.article
                    key={story.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="group bg-white rounded-3xl p-8 shadow-sm border border-stone-200 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-stone-500" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-stone-900">{story.author}</p>
                          <div className="flex items-center gap-1 text-xs text-stone-400">
                            <Clock className="w-3 h-3" />
                            <span>{formatDistanceToNow(new Date(story.created_at))} ago</span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleLike(story.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-50 text-stone-600 hover:bg-red-50 hover:text-red-500 transition-colors group/like"
                      >
                        <Heart className={cn("w-4 h-4 transition-transform group-active/like:scale-125", story.likes > 0 && "fill-red-500 text-red-500")} />
                        <span className="text-xs font-semibold">{story.likes}</span>
                      </button>
                    </div>

                    <h2 className="text-3xl font-serif font-bold mb-4 leading-tight group-hover:text-stone-700 transition-colors">
                      {story.title}
                    </h2>

                    <div className="markdown-body prose prose-stone max-w-none text-stone-600 mb-8">
                      <Markdown>{story.content}</Markdown>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-stone-100">
                      <div className="flex items-center gap-4">
                        <button className="flex items-center gap-2 text-stone-400 hover:text-stone-600 transition-colors">
                          <MessageSquare className="w-4 h-4" />
                          <span className="text-xs font-medium">Add comment</span>
                        </button>
                      </div>
                      <button className="text-stone-400 hover:text-stone-900 transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-widest">
                        Read More <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.article>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating AI Chat */}
      <div className="fixed bottom-6 right-6 z-[60]">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-16 right-0 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col h-[500px]"
            >
              <div className="bg-stone-900 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-medium text-sm">Katha Assistant</span>
                </div>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="text-stone-400 hover:text-white transition-colors"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-6 h-6 text-stone-400" />
                    </div>
                    <p className="text-stone-500 text-sm">Hi! How can I help you with your stories today?</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] px-4 py-2 rounded-2xl text-sm",
                      msg.role === "user" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-800"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-stone-100 px-4 py-2 rounded-2xl">
                      <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="p-4 border-t border-stone-100 flex flex-col gap-2">
                {isSharedUrl && messageCount >= CHAT_LIMIT && (
                  <p className="text-[10px] text-red-500 font-medium text-center mb-1">
                    Limit reached for shared version (3/3 messages)
                  </p>
                )}
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={isSharedUrl && messageCount >= CHAT_LIMIT ? "Limit reached" : "Ask anything..."}
                    disabled={isSharedUrl && messageCount >= CHAT_LIMIT}
                    className="flex-1 px-4 py-2 bg-stone-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/5 disabled:opacity-50"
                  />
                  <button 
                    type="submit"
                    disabled={isChatLoading || !chatInput.trim() || (isSharedUrl && messageCount >= CHAT_LIMIT)}
                    className="p-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                {isSharedUrl && messageCount < CHAT_LIMIT && (
                  <p className="text-[10px] text-stone-400 text-center">
                    Shared version: {CHAT_LIMIT - messageCount} messages remaining
                  </p>
                )}
                {!isSharedUrl && (
                  <p className="text-[10px] text-emerald-600 text-center font-medium">
                    Owner Mode: Unlimited messages
                  </p>
                )}
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95",
            isChatOpen ? "bg-white text-stone-900 border border-stone-200" : "bg-stone-900 text-white"
          )}
        >
          {isChatOpen ? <Plus className="w-6 h-6 rotate-45" /> : <Sparkles className="w-6 h-6" />}
        </button>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-serif font-bold">App Settings</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-stone-400 hover:text-stone-900">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">Authorized App URL</label>
                  <div className="flex gap-2 mb-2">
                    <input 
                      type="url" 
                      value={tempUrl}
                      onChange={(e) => setTempUrl(e.target.value)}
                      placeholder="https://your-shared-url.run.app"
                      className="flex-1 px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all text-sm"
                    />
                    <button 
                      onClick={() => setTempUrl(window.location.origin)}
                      className="px-3 py-2 bg-stone-100 text-stone-600 rounded-xl text-xs font-medium hover:bg-stone-200 transition-colors"
                      type="button"
                    >
                      Use Current
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-stone-400 leading-relaxed">
                    AI features will only work on this URL. Enter the full shared URL (including https://).
                  </p>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={handleSaveSettings}
                    className="w-full bg-stone-900 text-white py-3 rounded-xl text-sm font-bold hover:bg-stone-800 transition-colors shadow-lg"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="py-12 border-t border-stone-200 mt-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-stone-400 text-sm font-medium mb-2">© 2026 Katha Story App</p>
          <p className="text-stone-300 text-xs">Crafted with passion and AI.</p>
        </div>
      </footer>
    </div>
  );
}
