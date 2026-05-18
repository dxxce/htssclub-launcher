# Backend API Documentation

The base path for all APIs is `/api`. The backend runs on `https://ani.htss.club/api` by default.

**Authentication:** 
Routes marked as `[Guarded]` require the user to be authenticated. Authentication uses a JWT token stored in an `httpOnly` cookie named `access_token`.

---

## 1. Auth (`/api/auth`)

- **POST** `/register`
  - **Body**: `RegisterDto` (typically requires username, email, password)
  - **Description**: Registers a new user and sets the `access_token` cookie.

- **POST** `/login`
  - **Body**: `LoginDto` (typically requires email/username and password)
  - **Description**: Logs in a user and sets the `access_token` cookie.

- **POST** `/logout`
  - **Description**: Logs out the user by clearing the `access_token` cookie.

- **POST** `/forgot-password`
  - **Body**: `ForgotPasswordDto`
  - **Description**: Initiates the forgot password flow.

- **POST** `/reset-password`
  - **Body**: `ResetPasswordDto`
  - **Description**: Resets the password using a token.

- **GET** `/me` `[Guarded]`
  - **Description**: Returns the authenticated user's profile.

- **POST** `/profile` `[Guarded]`
  - **Body**: Profile update payload
  - **Description**: Updates the authenticated user's profile.

---

## 2. Anime (`/api/anime`)

- **GET** `/`
  - **Query Params**: `page` (number), `sort`, `lang`, `genre`, `status`, `type`, `year`, `season`
  - **Description**: Fetches a paginated and filterable list of anime.

- **GET** `/search`
  - **Query Params**: `q` (string, required), `page` (number)
  - **Description**: Performs a search for anime based on the query `q`.

- **GET** `/search/live`
  - **Query Params**: `keyword` (string)
  - **Description**: Returns quick search results (typically used for live search dropdowns).

- **GET** `/top`
  - **Query Params**: `page` (number), `period` (string)
  - **Description**: Gets the top-rated anime.

- **GET** `/recent`
  - **Query Params**: `page` (number)
  - **Description**: Gets recently updated/added anime.

- **GET** `/trending`
  - **Description**: Gets trending anime.

- **GET** `/hero-section`
  - **Description**: Gets anime data specifically formatted for the hero carousel/section.

- **GET** `/tv-series`
  - **Query Params**: `page` (number)
  - **Description**: Gets anime that are TV series.

- **GET** `/top-sidebar`
  - **Description**: Gets top anime data formatted for sidebar display.

- **GET** `/proxy-hls`
  - **Query Params**: `url` (string, required)
  - **Description**: Proxies HLS streams to bypass CORS/restrictions.

- **GET** `/:slug`
  - **URL Params**: `slug` (string)
  - **Description**: Fetches detailed information about a specific anime by its slug.

- **GET** `/:slug/episodes`
  - **URL Params**: `slug` (string)
  - **Description**: Fetches the list of episodes for a specific anime.

- **GET** `/:slug/episode/:episode`
  - **URL Params**: `slug` (string), `episode` (string)
  - **Description**: Fetches streaming data/links for a specific episode of an anime.

---

## 3. Bookmarks (`/api/bookmarks`)
*All routes in this controller are `[Guarded]`.*

- **GET** `/`
  - **Description**: Gets all bookmarked anime for the current user.

- **POST** `/toggle`
  - **Body**: Data containing `animeId` and other relevant anime info.
  - **Description**: Toggles (adds/removes) a bookmark for the current user.

- **GET** `/check/:animeId`
  - **URL Params**: `animeId` (string/number)
  - **Description**: Checks if a specific anime is bookmarked by the current user.

---

## 4. Comments (`/api/comments`)

- **GET** `/:animeId`
  - **URL Params**: `animeId` (string/number)
  - **Query Params**: `episodeId` (optional), `page` (number), `limit` (number)
  - **Description**: Gets comments for a specific anime, optionally filtered by episode.

- **POST** `/` `[Guarded]`
  - **Body**: `CreateCommentDto` (animeId, episodeId, content, etc.)
  - **Description**: Creates a new comment.

- **DELETE** `/:commentId` `[Guarded]`
  - **URL Params**: `commentId` (string)
  - **Description**: Deletes a comment (must belong to the user).

---

## 5. History (`/api/history`)
*All routes in this controller are `[Guarded]`.*

- **GET** `/`
  - **Query Params**: `page` (number), `limit` (number)
  - **Description**: Gets the user's watch history.

- **GET** `/check/:animeId`
  - **URL Params**: `animeId` (string/number)
  - **Description**: Gets the user's watch history for a specific anime.

- **POST** `/`
  - **Body**: `AddHistoryDto` (animeId, episodeId, timestamp, etc.)
  - **Description**: Adds or updates an entry in the user's watch history.

- **DELETE** `/all`
  - **Description**: Clears the user's entire watch history.

- **DELETE** `/:animeId`
  - **URL Params**: `animeId` (string/number)
  - **Description**: Removes a specific anime from the user's watch history.

---

## 6. Notifications (`/api/notifications`)
*All routes in this controller are `[Guarded]`.*

- **GET** `/`
  - **Description**: Gets all notifications for the current user.

- **PATCH** `/read-all`
  - **Description**: Marks all notifications as read for the current user.

- **PATCH** `/:id/read`
  - **URL Params**: `id` (string)
  - **Description**: Marks a specific notification as read.
