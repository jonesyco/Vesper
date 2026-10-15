import { $, createElement, createIcon, showToast } from "./ui.js";
import * as images from "./image-store.js";
import { refreshBackground } from "./background.js";

let thumbUrls = [];

async function renderGrid() {
  const records = await images.listPhotos();
  thumbUrls.forEach((url) => URL.revokeObjectURL(url));
  thumbUrls = [];

  $("photo-grid").replaceChildren(...records.map((record) => {
    const url = URL.createObjectURL(record.thumb);
    thumbUrls.push(url);
    const item = createElement("li", "photo-thumb");
    item.style.backgroundImage = `url("${url}")`;

    const remove = createElement("button", "photo-remove");
    remove.type = "button";
    remove.title = "Delete photo";
    remove.setAttribute("aria-label", "Delete photo");
    remove.append(createIcon("x"));
    remove.addEventListener("click", async () => {
      try {
        await images.deletePhoto(record.id);
        await renderGrid();
        await refreshBackground();
      } catch (error) {
        console.error("Failed to delete photo:", error);
        showToast("Couldn't delete photo", "error");
      }
    });

    item.append(remove);
    return item;
  }));
}

// Adds each file on its own, so one bad file doesn't stop the rest.
async function addFiles(files) {
  let added = 0;
  for (const file of files) {
    try {
      await images.addPhoto(await images.preparePhoto(file));
      added += 1;
    } catch (error) {
      console.error(`Failed to add ${file.name}:`, error);
      const message = error && error.name === "QuotaExceededError"
        ? `Not enough space for ${file.name}`
        : `Couldn't add ${file.name}`;
      showToast(message, "error");
    }
  }
  if (added > 0) {
    showToast(added === 1 ? "Added 1 photo" : `Added ${added} photos`, "success");
    await renderGrid();
    await refreshBackground();
  }
}

function initDropTarget(panel) {
  const hasFiles = (event) => [...event.dataTransfer.types].includes("Files");
  panel.addEventListener("dragover", (event) => {
    if (hasFiles(event)) {
      event.preventDefault();
      panel.classList.add("is-file-over");
    }
  });
  panel.addEventListener("dragleave", (event) => {
    if (event.target === panel) {
      panel.classList.remove("is-file-over");
    }
  });
  panel.addEventListener("drop", (event) => {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    panel.classList.remove("is-file-over");
    addFiles([...event.dataTransfer.files]);
  });
}

export async function initPhotoSettings() {
  if (!(await images.isAvailable())) {
    $("photos-unavailable").hidden = false;
    $("photo-add").hidden = true;
    return;
  }

  const input = $("photo-input");
  input.addEventListener("change", () => {
    const files = [...input.files];
    input.value = "";
    addFiles(files);
  });
  initDropTarget($("settings-panel"));

  try {
    await renderGrid();
  } catch (error) {
    console.error("Failed to list photos:", error);
  }
}
