---
name: anime-streaming
description: Use when working on Anime Town video playback — the HLS.js player, seasons and episodes, quality switching, subtitles (WebVTT), autoplay next episode, watch progress, history and continue watching.
---

# Anime Streaming

## Права на контент — первым делом
Воспроизводится только контент, на который есть права (собственный, лицензированный, открытая лицензия). У каждой серии поле `license_status` (`licensed`, `own`, `open_license`, `none`); плеер показывает видео только если статус не `none`. Не добавлять парсеры, встраивание или проксирование сторонних пиратских источников.

## Хранение
- HLS: мастер-плейлист `.m3u8` с вариантами 360p/480p/720p/1080p, сегменты в Supabase Storage или CDN. Путь — `episodes.hls_url`.
- Субтитры — WebVTT (`.vtt`), таблица `subtitles (episode_id, lang, label, url, is_default)`.
- Для приватного контента — подписанные URL с коротким TTL, генерируются на сервере.

## Плеер (`src/features/player/`)
- Клиентский компонент `VideoPlayer`. Safari/iOS — нативный HLS (`video.canPlayType('application/vnd.apple.mpegurl')`), иначе `Hls.isSupported()` → `hls.loadSource()` + `attachMedia()`.
- Уничтожать экземпляр `hls.destroy()` при размонтировании и смене серии.
- Качество: `hls.levels` → меню; `hls.currentLevel = -1` — авто (ABR).
- Субтитры — `<track kind="subtitles">` для каждой дорожки, переключение через `textTracks`.
- Ошибки: обработка `Hls.Events.ERROR` (`fatal` → `startLoad()` для network, `recoverMediaError()` для media, иначе понятное сообщение).
- Горячие клавиши: пробел, ←/→ (±10 с), F, M; доступность — подписи кнопок.
- Следующая серия: оверлей за 10 с до конца, автопереход (настраивается).

## Прогресс просмотра
- Таблица `watch_progress (user_id, episode_id, position_sec, duration_sec, completed, updated_at)`, PK `(user_id, episode_id)`.
- Upsert раз в ~10 с, при паузе, `visibilitychange` и уходе со страницы (`navigator.sendBeacon` на Route Handler).
- `completed = position/duration ≥ 0.9`.
- «Продолжить просмотр» — последние незавершённые серии пользователя, отсортированные по `updated_at`.
- При открытии серии — предложить продолжить с сохранённой позиции.

## Проверка
- E2E (Playwright): плеер загружает тестовый лицензированный/собственный HLS-ролик, переключает субтитры, прогресс сохраняется и восстанавливается после перезагрузки.
- Сверка API HLS.js через Context7.
