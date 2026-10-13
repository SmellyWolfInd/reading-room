import { createFileRoute } from "@tanstack/react-router";
import { ReadingRoom } from "@/components/reading-room";

export const Route = createFileRoute("/")({
  component: ReadingRoom,
});
