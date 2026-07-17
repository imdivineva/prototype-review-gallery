import { firebaseConfig, ACCESS_CODE } from "./firebase-config.js";
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, deleteDoc, updateDoc,
  getDoc, getDocs, getCountFromServer, query, where, orderBy, onSnapshot, serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const GATE_KEY = "reviewGalleryAccess";

const gate = document.getElementById("gate");
const gateForm = document.getElementById("gate-form");
const gateInput = document.getElementById("gate-input");
const gateError = document.getElementById("gate-error");
const appEl = document.getElementById("app");

const projectSelect = document.getElementById("project-select");
const uploadProjectSelect = document.getElementById("upload-project-select");
const newProjectBtn = document.getElementById("new-project-btn");
const uploadBtn = document.getElementById("upload-btn");
const sectionsEl = document.getElementById("sections");
const emptyState = document.getElementById("empty-state");

const uploadModal = document.getElementById("upload-modal");
const uploadForm = document.getElementById("upload-form");
const uploadGroup = document.getElementById("upload-group");
const uploadFiles = document.getElementById("upload-files");
const uploadCaption = document.getElementById("upload-caption");
const uploadStatus = document.getElementById("upload-status");

const projectModal = document.getElementById("project-modal");
const projectForm = document.getElementById("project-form");
const projectNameInput = document.getElementById("project-name-input");

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxCaption = document.getElementById("lightbox-caption");
const likeBtn = document.getElementById("like-btn");
const dislikeBtn = document.getElementById("dislike-btn");
const likeCount = document.getElementById("like-count");
const dislikeCount = document.getElementById("dislike-count");
const commentList = document.getElementById("comment-list");
const commentForm = document.getElementById("comment-form");
const commentAuthor = document.getElementById("comment-author");
const commentText = document.getElementById("comment-text");
const editBtn = document.getElementById("edit-btn");
const deleteBtn = document.getElementById("delete-btn");

const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editGroup = document.getElementById("edit-group");
const editCaption = document.getElementById("edit-caption");

let currentProjectId = null;
let currentScreenshotId = null;
let currentScreenshotData = null;
let unsubscribeGrid = null;
let unsubscribeComments = null;

// ---------- Password gate ----------

if (localStorage.getItem(GATE_KEY) === ACCESS_CODE) {
  enterApp();
}

gateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (gateInput.value === ACCESS_CODE) {
    localStorage.setItem(GATE_KEY, ACCESS_CODE);
    enterApp();
  } else {
    gateError.hidden = false;
  }
});

function enterApp() {
  gate.hidden = true;
  appEl.hidden = false;
  signInAnonymously(auth).catch((err) => {
    console.error("Anonymous sign-in failed", err);
    alert("Could not connect to the backend. Check firebase-config.js and your Firebase project setup.");
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loadProjects();
  }
});

// ---------- Projects ----------

async function loadProjects() {
  const snap = await getDocs(query(collection(db, "projects"), orderBy("name")));
  projectSelect.innerHTML = "";
  uploadProjectSelect.innerHTML = "";

  if (snap.empty) {
    const opt = document.createElement("option");
    opt.textContent = "No projects yet — create one";
    opt.disabled = true;
    opt.selected = true;
    projectSelect.appendChild(opt);
    return;
  }

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    [projectSelect, uploadProjectSelect].forEach((select) => {
      const opt = document.createElement("option");
      opt.value = docSnap.id;
      opt.textContent = data.name;
      select.appendChild(opt);
    });
  });

  currentProjectId = projectSelect.value;
  watchGrid();
}

projectSelect.addEventListener("change", () => {
  currentProjectId = projectSelect.value;
  watchGrid();
});

newProjectBtn.addEventListener("click", () => openModal(projectModal));

projectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = projectNameInput.value.trim();
  if (!name) return;
  const docRef = await addDoc(collection(db, "projects"), {
    name,
    createdAt: serverTimestamp()
  });
  projectNameInput.value = "";
  closeModal(projectModal);
  await loadProjects();
  projectSelect.value = docRef.id;
  currentProjectId = docRef.id;
  watchGrid();
});

// ---------- Grid ----------

function watchGrid() {
  if (unsubscribeGrid) unsubscribeGrid();
  if (!currentProjectId) return;

  // No orderBy here on purpose: combining where() + orderBy() on different
  // fields needs a Firestore composite index. Sorting client-side avoids
  // that manual setup step entirely.
  const q = query(
    collection(db, "screenshots"),
    where("projectId", "==", currentProjectId)
  );

  unsubscribeGrid = onSnapshot(
    q,
    (snap) => {
      emptyState.hidden = !snap.empty;
      const docs = snap.docs.slice().sort((a, b) => orderOf(b.data()) - orderOf(a.data()));
      renderSections(docs);
    },
    (err) => {
      console.error("Grid listener failed", err);
      alert("Could not load screenshots. Check the console for details.");
    }
  );
}

// Higher order = shown earlier. New uploads get Date.now() so they default
// to newest-first; dragging a card assigns it a value between its new
// neighbors' order values so it holds a manually-chosen position. Docs from
// before this feature existed have no order field, so fall back to their
// upload time.
function orderOf(data) {
  return typeof data.order === "number"
    ? data.order
    : data.uploadedAt
    ? data.uploadedAt.toMillis()
    : 0;
}

function renderSections(docs) {
  // docs arrive sorted newest-first, so the first doc seen for each group
  // key is that group's most recent upload — Map insertion order then
  // naturally puts the most recently active group first. "Ungrouped"
  // always sorts last regardless of recency.
  const groups = new Map();
  docs.forEach((docSnap) => {
    const data = docSnap.data();
    const key = data.group && data.group.trim() ? data.group.trim() : "Ungrouped";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: docSnap.id, data });
  });

  const ordered = [...groups.keys()].filter((k) => k !== "Ungrouped");
  if (groups.has("Ungrouped")) ordered.push("Ungrouped");

  sectionsEl.innerHTML = "";
  ordered.forEach((key) => {
    const items = groups.get(key);
    const section = document.createElement("div");
    section.className = "section" + (key === "Ungrouped" ? " section-ungrouped" : "");
    section.innerHTML = `
      <div class="section-head">
        <h2>${escapeHtml(key)}</h2>
        <span class="section-count">${items.length} screenshot${items.length === 1 ? "" : "s"}</span>
      </div>
      <div class="grid"></div>
    `;
    const grid = section.querySelector(".grid");
    items.forEach(({ id, data }) => grid.appendChild(renderCard(id, data)));
    wireDropTarget(grid, key);
    sectionsEl.appendChild(section);
  });
}

// ---------- Drag-and-drop reordering ----------

function wireDropTarget(grid, groupKey) {
  grid.addEventListener("dragover", (e) => {
    const dragging = document.querySelector(".card.dragging");
    if (!dragging) return;
    e.preventDefault();
    const afterElement = getDragAfterElement(grid, e.clientY);
    if (afterElement == null) {
      grid.appendChild(dragging);
    } else {
      grid.insertBefore(dragging, afterElement);
    }
  });

  grid.addEventListener("drop", (e) => {
    e.preventDefault();
    const dragging = document.querySelector(".card.dragging");
    if (!dragging) return;

    const id = dragging.dataset.screenshotId;
    const prev = dragging.previousElementSibling;
    const next = dragging.nextElementSibling;
    const prevOrder = prev ? Number(prev.dataset.order) : null;
    const nextOrder = next ? Number(next.dataset.order) : null;

    let newOrder;
    if (prevOrder == null && nextOrder == null) newOrder = Date.now();
    else if (prevOrder == null) newOrder = nextOrder + 1000;
    else if (nextOrder == null) newOrder = prevOrder - 1000;
    else newOrder = (prevOrder + nextOrder) / 2;

    const group = groupKey === "Ungrouped" ? "" : groupKey;

    updateDoc(doc(db, "screenshots", id), { order: newOrder, group }).catch((err) => {
      console.error("Reorder failed", err);
      alert("Could not save the new order. Check the console for details.");
    });
  });
}

function getDragAfterElement(grid, y) {
  const cards = [...grid.querySelectorAll(".card:not(.dragging)")];
  return cards.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function renderCard(id, data) {
  const card = document.createElement("div");
  card.className = "card";
  card.draggable = true;
  card.dataset.screenshotId = id;
  card.dataset.order = orderOf(data);
  card.innerHTML = `
    <img src="${data.imageUrl}" alt="${escapeHtml(data.caption || "Screenshot")}" loading="lazy" draggable="false">
    <div class="card-body">
      <div class="card-caption">${escapeHtml(data.caption || "")}</div>
      <div class="card-meta">
        <span>👍 ${data.likes || 0}</span>
        <span>👎 ${data.dislikes || 0}</span>
        <span class="comment-badge" hidden></span>
      </div>
    </div>
  `;
  card.addEventListener("click", () => openLightbox(id, data));
  card.addEventListener("dragstart", () => card.classList.add("dragging"));
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  const badge = card.querySelector(".comment-badge");
  getCountFromServer(collection(db, "screenshots", id, "comments"))
    .then((snap) => {
      const count = snap.data().count;
      if (count > 0) {
        badge.textContent = `💬 ${count}`;
        badge.hidden = false;
      }
    })
    .catch((err) => console.error("Comment count failed", err));

  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Upload ----------

uploadBtn.addEventListener("click", () => {
  if (!currentProjectId) {
    alert("Create a project first.");
    return;
  }
  uploadProjectSelect.value = currentProjectId;
  openModal(uploadModal);
});

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const projectId = uploadProjectSelect.value;
  const group = uploadGroup.value.trim();
  const files = Array.from(uploadFiles.files);
  const caption = uploadCaption.value.trim();
  if (!projectId || files.length === 0) return;

  uploadStatus.textContent = `Uploading 0 / ${files.length}...`;
  let done = 0;

  try {
    for (const file of files) {
      const { imageUrl, publicId } = await uploadToCloudinary(file);

      await addDoc(collection(db, "screenshots"), {
        projectId,
        group,
        order: Date.now(),
        imageUrl,
        cloudinaryPublicId: publicId,
        caption,
        likes: 0,
        dislikes: 0,
        uploadedAt: serverTimestamp()
      });

      done++;
      uploadStatus.textContent = `Uploading ${done} / ${files.length}...`;
    }

    uploadStatus.textContent = "Done.";
    uploadForm.reset();
    setTimeout(() => {
      uploadStatus.textContent = "";
      closeModal(uploadModal);
    }, 600);
  } catch (err) {
    console.error(err);
    uploadStatus.textContent = "Upload failed. Check console for details.";
  }
});

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "screenshots");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Cloudinary upload failed: ${errBody}`);
  }

  const data = await response.json();
  return { imageUrl: data.secure_url, publicId: data.public_id };
}

// ---------- Lightbox / reactions / comments ----------

async function openLightbox(id, data) {
  currentScreenshotId = id;
  currentScreenshotData = data;
  lightboxImg.src = data.imageUrl;
  lightboxCaption.textContent = data.caption || "";
  likeCount.textContent = data.likes || 0;
  dislikeCount.textContent = data.dislikes || 0;
  likeBtn.classList.remove("active-like");
  dislikeBtn.classList.remove("active-dislike");

  const uid = auth.currentUser.uid;
  const reactionSnap = await getDoc(doc(db, "screenshots", id, "reactions", uid));
  if (reactionSnap.exists()) {
    const type = reactionSnap.data().type;
    if (type === "like") likeBtn.classList.add("active-like");
    if (type === "dislike") dislikeBtn.classList.add("active-dislike");
  }

  watchComments(id);
  openModal(lightbox);
}

likeBtn.addEventListener("click", () => react("like"));
dislikeBtn.addEventListener("click", () => react("dislike"));

async function react(type) {
  const id = currentScreenshotId;
  const uid = auth.currentUser.uid;
  const reactionRef = doc(db, "screenshots", id, "reactions", uid);
  const screenshotRef = doc(db, "screenshots", id);

  await runTransaction(db, async (tx) => {
    const reactionSnap = await tx.get(reactionRef);
    const screenshotSnap = await tx.get(screenshotRef);
    const current = screenshotSnap.data();
    let likes = current.likes || 0;
    let dislikes = current.dislikes || 0;
    const prevType = reactionSnap.exists() ? reactionSnap.data().type : null;

    if (prevType === type) {
      if (type === "like") likes = Math.max(0, likes - 1);
      else dislikes = Math.max(0, dislikes - 1);
      tx.delete(reactionRef);
    } else {
      if (prevType === "like") likes = Math.max(0, likes - 1);
      if (prevType === "dislike") dislikes = Math.max(0, dislikes - 1);
      if (type === "like") likes++;
      else dislikes++;
      tx.set(reactionRef, { type, updatedAt: serverTimestamp() });
    }

    tx.update(screenshotRef, { likes, dislikes });
  });

  // Refresh displayed state from the doc we just wrote.
  const fresh = await getDoc(screenshotRef);
  const freshData = fresh.data();
  likeCount.textContent = freshData.likes || 0;
  dislikeCount.textContent = freshData.dislikes || 0;
  const reactionSnap = await getDoc(reactionRef);
  likeBtn.classList.toggle("active-like", reactionSnap.exists() && reactionSnap.data().type === "like");
  dislikeBtn.classList.toggle("active-dislike", reactionSnap.exists() && reactionSnap.data().type === "dislike");
}

function watchComments(screenshotId) {
  if (unsubscribeComments) unsubscribeComments();
  const q = query(
    collection(db, "screenshots", screenshotId, "comments"),
    orderBy("createdAt", "asc")
  );
  unsubscribeComments = onSnapshot(q, (snap) => {
    commentList.innerHTML = "";
    snap.forEach((docSnap) => {
      commentList.appendChild(renderComment(screenshotId, docSnap.id, docSnap.data()));
    });
    commentList.scrollTop = commentList.scrollHeight;
  });
}

function renderComment(screenshotId, commentId, data) {
  const el = document.createElement("div");
  el.className = "comment";
  showCommentView(el, screenshotId, commentId, data);
  return el;
}

function showCommentView(el, screenshotId, commentId, data) {
  const time = data.createdAt ? data.createdAt.toDate().toLocaleString() : "";
  const edited = data.editedAt ? " (edited)" : "";
  el.innerHTML = `
    <span class="comment-author">${escapeHtml(data.author || "Anonymous")}</span>
    <span class="comment-time">${time}${edited}</span>
    <p class="comment-text">${escapeHtml(data.text)}</p>
    <div class="comment-actions">
      <button type="button" class="comment-action-btn" data-action="edit">Edit</button>
      <button type="button" class="comment-action-btn comment-action-danger" data-action="delete">Delete</button>
    </div>
  `;
  el.querySelector('[data-action="edit"]').addEventListener("click", () => {
    showCommentEdit(el, screenshotId, commentId, data);
  });
  el.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    const ok = confirm("Delete this comment? This can't be undone.");
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "screenshots", screenshotId, "comments", commentId));
    } catch (err) {
      console.error("Delete comment failed", err);
      alert("Could not delete the comment. Check the console for details.");
    }
  });
}

function showCommentEdit(el, screenshotId, commentId, data) {
  el.innerHTML = `
    <span class="comment-author">${escapeHtml(data.author || "Anonymous")}</span>
    <textarea class="comment-edit-text" maxlength="1000">${escapeHtml(data.text)}</textarea>
    <div class="comment-actions">
      <button type="button" class="comment-action-btn" data-action="save">Save</button>
      <button type="button" class="comment-action-btn" data-action="cancel">Cancel</button>
    </div>
  `;
  el.querySelector('[data-action="cancel"]').addEventListener("click", () => {
    showCommentView(el, screenshotId, commentId, data);
  });
  el.querySelector('[data-action="save"]').addEventListener("click", async () => {
    const newText = el.querySelector(".comment-edit-text").value.trim();
    if (!newText) return;
    try {
      await updateDoc(doc(db, "screenshots", screenshotId, "comments", commentId), {
        text: newText,
        editedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Edit comment failed", err);
      alert("Could not save the comment. Check the console for details.");
    }
  });
}

commentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = commentText.value.trim();
  if (!text || !currentScreenshotId) return;

  await addDoc(collection(db, "screenshots", currentScreenshotId, "comments"), {
    text,
    author: commentAuthor.value.trim() || "Anonymous",
    createdAt: serverTimestamp()
  });

  commentText.value = "";
});

// ---------- Edit / delete ----------

editBtn.addEventListener("click", () => {
  editGroup.value = currentScreenshotData.group || "";
  editCaption.value = currentScreenshotData.caption || "";
  openModal(editModal);
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const group = editGroup.value.trim();
  const caption = editCaption.value.trim();

  try {
    await updateDoc(doc(db, "screenshots", currentScreenshotId), { group, caption });
    currentScreenshotData = { ...currentScreenshotData, group, caption };
    lightboxCaption.textContent = caption;
    closeModal(editModal);
  } catch (err) {
    console.error("Edit failed", err);
    alert("Could not save changes. This usually means the Firestore security rules haven't been updated to allow edits yet — see the README.");
  }
});

deleteBtn.addEventListener("click", async () => {
  const ok = confirm("Delete this screenshot? This can't be undone.");
  if (!ok) return;

  try {
    await deleteDoc(doc(db, "screenshots", currentScreenshotId));
    closeModal(lightbox);
  } catch (err) {
    console.error("Delete failed", err);
    alert("Could not delete this screenshot. This usually means the Firestore security rules haven't been updated to allow deletes yet — see the README.");
  }
});

// ---------- Modal helpers ----------

function openModal(modal) {
  modal.hidden = false;
}

function closeModal(modal) {
  modal.hidden = true;
}

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(document.getElementById(btn.dataset.close)));
});

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal(modal);
  });
});
