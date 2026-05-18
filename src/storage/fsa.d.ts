// Augment lib.dom with the File System Access API permission methods
// and the directory picker entry point. The base `FileSystemHandle` /
// `FileSystemDirectoryHandle` interfaces ship with TS but
// `queryPermission` / `requestPermission` / `window.showDirectoryPicker`
// do not yet, since the spec sits outside the core File System
// standard. Only declares the surface the folder backend uses.

declare global {
  type FileSystemPermissionMode = "read" | "readwrite";

  interface FileSystemHandlePermissionDescriptor {
    mode?: FileSystemPermissionMode;
  }

  interface FileSystemHandle {
    queryPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
    requestPermission(
      descriptor?: FileSystemHandlePermissionDescriptor,
    ): Promise<PermissionState>;
  }

  interface DirectoryPickerOptions {
    id?: string;
    mode?: FileSystemPermissionMode;
    startIn?:
      | FileSystemHandle
      | "desktop"
      | "documents"
      | "downloads"
      | "music"
      | "pictures"
      | "videos";
  }

  interface Window {
    showDirectoryPicker?(
      options?: DirectoryPickerOptions,
    ): Promise<FileSystemDirectoryHandle>;
  }
}

export {};
