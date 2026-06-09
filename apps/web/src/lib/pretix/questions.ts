import { NotImplemented } from "./errors";

export interface PretixQuestion {
  id: number;
  question: Record<string, string>;
  type: string;
  required: boolean;
}

export function listQuestions(
  organizerSlug: string,
  eventSlug: string,
): Promise<PretixQuestion[]> {
  void organizerSlug;
  void eventSlug;
  throw new NotImplemented("questions.listQuestions");
}

export function createQuestion(
  organizerSlug: string,
  eventSlug: string,
  payload: Partial<PretixQuestion>,
): Promise<PretixQuestion> {
  void organizerSlug;
  void eventSlug;
  void payload;
  throw new NotImplemented("questions.createQuestion");
}
