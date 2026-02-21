import en from "@/lib/i18n/messages/en.json";
import ko from "@/lib/i18n/messages/ko.json";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

type MessagePrimitive = string;
export type MessageTree = {
  [key: string]: MessagePrimitive | MessageTree;
};

const MESSAGES: Record<Locale, MessageTree> = {
  en,
  ko,
};

function lookup(messages: MessageTree, key: string): string | null {
  const chunks = key.split(".");
  let cursor: MessagePrimitive | MessageTree = messages;

  for (const chunk of chunks) {
    if (typeof cursor === "string" || !Object.prototype.hasOwnProperty.call(cursor, chunk)) {
      return null;
    }
    cursor = cursor[chunk] as MessagePrimitive | MessageTree;
  }

  return typeof cursor === "string" ? cursor : null;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) return `{${name}}`;
    return String(vars[name]);
  });
}

export function getMessages(locale: Locale): MessageTree {
  return MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
}

export function tFromMessages(
  messages: MessageTree,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const text = lookup(messages, key) ?? key;
  return interpolate(text, vars);
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  return tFromMessages(getMessages(locale), key, vars);
}
