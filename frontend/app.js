const $ = (id) => document.getElementById(id);
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;
let chosen = null;
function status(text, error = false) {
  $("status").textContent = text;
  $("status").style.color = error ? "#ff8b8b" : "#f1d4a0";
}
function setFile(file) {
  chosen = file || null;
  $("selected").textContent = chosen
    ? chosen.name
    : "Ningún archivo seleccionado";
}
$("file").addEventListener("change", (e) => setFile(e.target.files[0]));
const drop = $("dropzone");
["dragenter", "dragover"].forEach((event) =>
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  }),
);
["dragleave", "drop"].forEach((event) =>
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  }),
);
drop.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));
async function api(url, options) {
  const res = await fetch(url, options);
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error("Respuesta inesperada del servidor");
  }
  if (!res.ok) throw Error(data.error || "Error HTTP " + res.status);
  return data;
}
$("uploadBtn").addEventListener("click", async () => {
  const file = chosen;
  if (!file) return status("Selecciona una imagen.", true);
  if (!allowed.has(file.type))
    return status("Solo se admite JPG, PNG o WEBP.", true);
  if (file.size <= 0 || file.size >= maxBytes)
    return status("La imagen debe pesar menos de 5 MB.", true);
  $("uploadBtn").disabled = true;
  try {
    status("Solicitando autorización temporal...");
    const signed = await api("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    });
    status("Subiendo directamente a S3...");
    const result = await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: signed.headers,
      body: file,
    });
    if (!result.ok)
      throw Error(
        "S3 rechazó la subida (HTTP " +
          result.status +
          "). Revisa CORS, hora del equipo y permisos.",
      );
    await api("/api/validate-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: signed.key, contentType: file.type }),
    });
    status("¡Imagen subida correctamente!");
    setFile(null);
    $("file").value = "";
    await loadGallery();
  } catch (e) {
    status(e.message, true);
  } finally {
    $("uploadBtn").disabled = false;
  }
});
$("refresh").addEventListener("click", loadGallery);
async function loadGallery() {
  try {
    const images = await api("/api/images");
    const gallery = $("gallery");
    gallery.replaceChildren();
    if (!images.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent =
        "Aún no hay imágenes en la colección. Sube la primera.";
      gallery.append(empty);
      return;
    }
    for (const item of images) {
      const card = document.createElement("article");
      card.className = "card";
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = "Imagen guardada en S3";
      img.loading = "lazy";
      const meta = document.createElement("div");
      meta.className = "meta";
      const name = document.createElement("strong");
      name.textContent = item.key
        .split("/")
        .pop()
        .replace(/^\d+-[a-f0-9]{12}-/, "");
      const detail = document.createElement("small");
      detail.textContent =
        (item.size / 1024).toFixed(1) +
        " KB · " +
        new Date(item.lastModified).toLocaleDateString("es-PE");
      const del = document.createElement("button");
      del.textContent = "Eliminar";
      del.addEventListener("click", async () => {
        if (
          !confirm(
            "¿Eliminar esta imagen? Con versionado, queda una versión recuperable.",
          )
        )
          return;
        try {
          await api("/api/images/" + encodeURIComponent(item.key), {
            method: "DELETE",
          });
          status("Imagen eliminada de la galería");
          await loadGallery();
        } catch (e) {
          status(e.message, true);
        }
      });
      meta.append(name, detail, del);
      card.append(img, meta);
      gallery.append(card);
    }
  } catch (e) {
    status(e.message, true);
  }
}
loadGallery();
