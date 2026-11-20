"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation } from "@/lib/types";
import { removeConversationStorage } from "@/lib/storage";
import { createConversation } from "@/lib/chat";

type Tone = "info" | "success" | "error" | "busy";
type Notify = (message: string, tone?: Tone) => void;

export function useConversations({
  routeId,
  preserveId: _preserveId,
  notify,
  defaultModel,
}: {
  routeId?: string | null;
  preserveId?: string | null;
  notify: Notify;
  defaultModel: string;
}) {
  const [items, setItems] = useState<Conversation[]>([]);
  const [ready, setReady] = useState(false);
  const notifyRef = useRef(notify);
  const defaultModelRef = useRef(defaultModel);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  useEffect(() => {
    defaultModelRef.current = defaultModel;
  }, [defaultModel]);

  useEffect(() => {
    setItems([]);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !routeId) return;
    setItems((prev) => {
      if (prev.some((c) => c.id === routeId)) return prev;
      const now = Date.now();
      const shell: Conversation = {
        id: routeId,
        title: "New conversation",
        createdAt: now,
        updatedAt: now,
        model: defaultModelRef.current,
        messages: [],
      };
      return [shell, ...prev];
    });
  }, [ready, routeId]);

  void _preserveId;

  const create = useCallback((model?: string) => {
    const conversation = createConversation(model ?? defaultModelRef.current);
    setItems((prev) => [conversation, ...prev]);
    return conversation;
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<Conversation> | ((conversation: Conversation) => Conversation)) => {
      setItems((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== id) return conversation;
          if (typeof patch === "function") return patch(conversation);
          return { ...conversation, ...patch, updatedAt: Date.now() };
        }),
      );
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((conversation) => conversation.id !== id));
  }, []);

  const rename = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      setItems((prev) =>
        prev.map((conversation) =>
          conversation.id === id
            ? { ...conversation, title: trimmed.slice(0, 120), updatedAt: Date.now() }
            : conversation,
        ),
      );
    },
    [],
  );

  const togglePin = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((conversation) =>
        conversation.id === id
          ? { ...conversation, pinned: !conversation.pinned, updatedAt: Date.now() }
          : conversation,
      ),
    );
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    removeConversationStorage();
  }, []);

  const setConversations = useCallback((next: Conversation[]) => {
    setItems(next);
  }, []);

  const totalAttachmentBytes = useMemo(
    () =>
      items.reduce(
        (sum, conversation) =>
          sum +
          conversation.messages.reduce(
            (inner, message) =>
              inner + (message.attachments ?? []).reduce((a, attachment) => a + attachment.size, 0),
            0,
          ),
        0,
      ),
    [items],
  );

  return {
    conversations: items,
    ready,
    create,
    update,
    remove,
    rename,
    togglePin,
    clearAll,
    setConversations,
    totalAttachmentBytes,
  };
}
