const API = "/api";
const app = document.getElementById("app");
let token = localStorage.getItem("social_token");
let currentUser = JSON.parse(localStorage.getItem("social_user") || "null");

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

async function api(path, options = {}) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  // JSON requests ke liye Content-Type set karo
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(API + path, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }

  return data;
}

function showAuth(mode = "login") {
  app.innerHTML = `
    <main class="auth-screen">
      <section class="auth-card">
        <div class="brand">MiniSocial</div>
        <p class="subtitle">Task 2 — Mini Social Media Platform</p>

        <div class="tabs">
          <button class="tab ${mode === "login" ? "active" : ""}" onclick="showAuth('login')">Login</button>
          <button class="tab ${mode === "register" ? "active" : ""}" onclick="showAuth('register')">Register</button>
        </div>

        <form id="authForm">
          ${mode === "register" ? `
            <div class="field">
              <label>Full name</label>
              <input id="name" required />
            </div>
            <div class="field">
              <label>Username</label>
              <input id="username" required />
            </div>
          ` : ""}
          <div class="field">
            <label>Email</label>
            <input id="email" type="email" required />
          </div>
          <div class="field">
            <label>Password</label>
            <input id="password" type="password" minlength="6" required />
          </div>
          <div class="error" id="authError"></div>
          <button class="primary-btn">${mode === "login" ? "Login" : "Create account"}</button>
        </form>
      </section>
    </main>
  `;

  document.getElementById("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const error = document.getElementById("authError");
    error.textContent = "";

    try {
      const body = {
        email: document.getElementById("email").value,
        password: document.getElementById("password").value
      };

      if (mode === "register") {
        body.name = document.getElementById("name").value;
        body.username = document.getElementById("username").value;
      }

      const data = await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(body)
      });

      token = data.token;
      currentUser = data.user;
      localStorage.setItem("social_token", token);
      localStorage.setItem("social_user", JSON.stringify(currentUser));
      renderApp();
    } catch (err) {
      error.textContent = err.message;
    }
  });
}

async function renderApp() {
  if (!token) return showAuth();

  try {
    currentUser = await api("/me");
    localStorage.setItem("social_user", JSON.stringify(currentUser));
  } catch {
    logout();
    return;
  }

  app.innerHTML = `
    <nav class="navbar">
      <div class="nav-inner">
        <div class="nav-brand">MiniSocial</div>
        <div class="search"><input id="searchInput" placeholder="Search people..." /></div>
        <div class="nav-user">
          <span>@${escapeHtml(currentUser.username)}</span>
          <button class="logout" onclick="logout()">Logout</button>
        </div>
      </div>
    </nav>

    <main class="layout">
      <aside class="sidebar">
        <div class="menu-title">Navigation</div>
        <button class="menu-btn" onclick="loadFeed()">🏠 Home Feed</button>
        <button class="menu-btn" onclick="loadProfile('${escapeHtml(currentUser.username)}')">👤 My Profile</button>
        <button class="menu-btn" onclick="focusComposer()">✍️ Create Post</button>
      </aside>

      <section>
        <div class="composer" id="composer">
  <textarea
    id="postContent"
    maxlength="500"
    placeholder="What's on your mind, ${escapeHtml(currentUser.name)}?"
  ></textarea>

  <div class="composer-footer">
    <label class="image-picker">
      🖼️ Add Photo
      <input
        id="postImage"
        type="file"
        accept="image/*"
        hidden
      />
    </label>

    <span id="imageName">No image selected</span>

    <button class="small-btn" onclick="createPost()">Post</button>
  </div>
</div>

<div id="feed"></div>

      <aside class="rightbar">
        <div class="people-title">People to connect</div>
        <div id="people"><div class="empty">Search for users above.</div></div>
      </aside>
    </main>
  `;
document.getElementById("searchInput").addEventListener(
  "input",
  debounce(searchUsers, 350)
);

// Image selection
const postImage = document.getElementById("postImage");
const imageName = document.getElementById("imageName");

postImage.addEventListener("change", () => {
  if (postImage.files.length > 0) {
    imageName.textContent = postImage.files[0].name;
  } else {
    imageName.textContent = "No image selected";
  }
});

await loadFeed();
await searchUsers({ target: { value: "" } });

}

function focusComposer() {
  document.getElementById("postContent")?.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadFeed() {
  const feed = document.getElementById("feed");
  feed.innerHTML = `<div class="empty">Loading posts...</div>`;

  try {
    const posts = await api("/posts");
    if (!posts.length) {
      feed.innerHTML = `<div class="post empty">No posts yet. Create the first post!</div>`;
      return;
    }

    feed.innerHTML = posts.map(post => `
      <article class="post" id="post-${post.id}">
        <div class="post-head">
          <div class="avatar">${escapeHtml(post.name[0].toUpperCase())}</div>
          <div>
            <div class="user-name">${escapeHtml(post.name)}</div>
            <div class="username">@${escapeHtml(post.username)}</div>
          </div>
          <div class="post-time">${new Date(post.created_at).toLocaleString()}</div>
        </div>

        ${post.content
  ? `<div class="post-content">${escapeHtml(post.content)}</div>`
  : ""}

${post.image_url
  ? `<img
       src="${escapeHtml(post.image_url)}"
       alt="Post image"
       class="post-image"
     />`
  : ""}

<div class="actions">
  <button class="action-btn ${post.liked_by_me ? "liked" : ""}" onclick="toggleLike(${post.id})">
    ${post.liked_by_me ? "♥" : "♡"} ${post.likes_count}
  </button>

  <button class="action-btn" onclick="toggleComments(${post.id})">
    💬 ${post.comments_count}
  </button>

  ${post.user_id === currentUser.id
    ? `<button class="action-btn" onclick="deletePost(${post.id})">🗑 Delete</button>`
    : ""}
</div>

<div class="comments" id="comments-${post.id}" style="display:none"></div>
</article>
    `).join("");
  } catch (err) {
    feed.innerHTML = `<div class="post error">${escapeHtml(err.message)}</div>`;
  }
}

async function createPost() {
  const textarea = document.getElementById("postContent");
  const imageInput = document.getElementById("postImage");

  const content = textarea.value.trim();
  const image = imageInput.files[0];

  console.log("Selected image:", image);

  if (!content && !image) {
    alert("Write something or select an image.");
    return;
  }

  if (image && image.size > 5 * 1024 * 1024) {
    alert("Image must be smaller than 5 MB.");
    return;
  }

  try {
    const formData = new FormData();

    formData.append("content", content);

    if (image) {
      formData.append("image", image);
    }

    console.log("Sending image:", formData.get("image"));

    const result = await api("/posts", {
      method: "POST",
      body: formData
    });

    console.log("Post response:", result);

    textarea.value = "";
    imageInput.value = "";

    document.getElementById("imageName").textContent =
      "No image selected";

    await loadFeed();

  } catch (err) {
    console.error("Create post error:", err);
    alert(err.message);
  }
}

async function deletePost(id) {
  if (!confirm("Delete this post?")) return;
  try {
    await api(`/posts/${id}`, { method: "DELETE" });
    await loadFeed();
  } catch (err) {
    alert(err.message);
  }
}
async function toggleLike(id) {
  try {
    await api(`/posts/${id}/like`, {
      method: "POST"
    });

    await loadFeed();
  } catch (err) {
    alert(err.message);
  }
}

async function toggleComments(id) {
  const box = document.getElementById(`comments-${id}`);

  if (box.style.display === "none") {
    box.style.display = "block";
    box.innerHTML = `<div class="empty">Loading comments...</div>`;

    try {
      const comments = await api(`/posts/${id}/comments`);
      box.innerHTML = `
        ${comments.length
          ? comments.map(c => `
            <div class="comment">
              <strong>@${escapeHtml(c.username)}</strong>${escapeHtml(c.content)}
            </div>
          `).join("")
          : `<div class="username">No comments yet.</div>`}
        <form class="comment-form" onsubmit="addComment(event, ${id})">
          <input id="comment-${id}" placeholder="Write a comment..." maxlength="300" />
          <button>Send</button>
        </form>
      `;
    } catch (err) {
      box.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
    }
  } else {
    box.style.display = "none";
  }
}

async function addComment(event, id) {
  event.preventDefault();
  const input = document.getElementById(`comment-${id}`);
  const content = input.value.trim();
  if (!content) return;

  try {
    await api(`/posts/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ content })
    });
    await loadFeed();
    const box = document.getElementById(`comments-${id}`);
    box.style.display = "block";
    await toggleComments(id);
    await toggleComments(id);
  } catch (err) {
    alert(err.message);
  }
}
async function addComment(event, id) {
  event.preventDefault();

  const input = document.getElementById(`comment-${id}`);
  const content = input.value.trim();

  if (!content) return;

  try {
    await api(`/posts/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ content })
    });

    await loadFeed();

    // Comments ko dobara open karke updated comments show karo
    const box = document.getElementById(`comments-${id}`);

    if (box) {
      box.style.display = "block";
      await toggleComments(id);
    }
  } catch (err) {
    alert(err.message);
  }
}


async function searchUsers(event) {
  const people = document.getElementById("people");

  if (!people) return;

  const q = event?.target?.value?.trim() || "";

  try {
    const users = await api(
      `/users?q=${encodeURIComponent(q || "%")}`
    );

    people.innerHTML = users.length
      ? users.map(user => `
          <div class="person">

            <div class="avatar">
              ${escapeHtml(user.name[0].toUpperCase())}
            </div>

            <div class="person-info">
              <div>
                <strong>${escapeHtml(user.name)}</strong>
              </div>

              <div class="username">
                @${escapeHtml(user.username)}
              </div>
            </div>

            <button
              class="follow-btn ${user.following ? "following" : ""}"
              onclick="toggleFollow(${user.id})"
            >
              ${user.following ? "Following" : "Follow"}
            </button>

          </div>
        `).join("")
      : `<div class="empty">No users found.</div>`;

  } catch (err) {
    people.innerHTML =
      `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

async function toggleFollow(id) {
  try {
    const result = await api(`/users/${id}/follow`, {
      method: "POST"
    });

    console.log("Follow response:", result);

    const input = document.getElementById("searchInput");

    await searchUsers({
      target: input
    });

  } catch (err) {
    console.error("Follow error:", err);
    alert("Follow failed: " + err.message);
  }
}

async function loadProfile(username) {
  try {
    const user = await api(`/users/${encodeURIComponent(username)}`);
    const feed = document.getElementById("feed");
    feed.innerHTML = `
      <div class="post">
        <div class="post-head">
          <div class="avatar">${escapeHtml(user.name[0].toUpperCase())}</div>
          <div>
            <div class="user-name">${escapeHtml(user.name)}</div>
            <div class="username">@${escapeHtml(user.username)}</div>
          </div>
        </div>
        <p>${escapeHtml(user.bio || "No bio yet.")}</p>
        <div class="actions">
          <span class="action-btn">Followers: ${user.followers_count}</span>
          <span class="action-btn">Following: ${user.following_count}</span>
        </div>
      </div>
      <button class="small-btn" onclick="loadFeed()">← Back to feed</button>
    `;
  } catch (err) {
    alert(err.message);
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem("social_token");
  localStorage.removeItem("social_user");
  showAuth();
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

if (token) renderApp();
else showAuth();