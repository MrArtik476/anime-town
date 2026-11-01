import { NotFoundMessage } from "@/components/layout/not-found-message";

export default function EpisodeNotFound() {
  return (
    <NotFoundMessage
      title="Серия недоступна"
      description="Такой серии нет или у Anime Town нет прав на её показ. Список доступных серий — на странице тайтла."
    />
  );
}
