const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const manifestPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const appGradlePath = path.join(__dirname, 'android', 'app', 'build.gradle');
const javaPkgDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'java', 'com', 'bar4torri', 'pos', 'offline');

if (!fs.existsSync(manifestPath)) {
  console.error('❌ Cartella android non trovata. Esegui prima: npx cap add android');
  process.exit(1);
}

// 1. Aggiunta permessi NFC, CAMERA, INTERNET e STORAGE (Android <= 9) in AndroidManifest.xml
let manifest = fs.readFileSync(manifestPath, 'utf8');
const requiredEntries = [
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.NFC" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
  '<uses-feature android:name="android.hardware.nfc" android:required="false" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />'
];

const missing = requiredEntries.filter(entry => !manifest.includes(entry));
if (missing.length > 0) {
  manifest = manifest.replace(
    '<application',
    missing.map(e => '    ' + e).join('\n') + '\n\n    <application'
  );
  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log('✅ Permessi NFC, CAMERA e STORAGE aggiunti a AndroidManifest.xml');
} else {
  console.log('ℹ️ Permessi già presenti in AndroidManifest.xml');
}

// 1B. Configurazione Firma Fissa (bar4torri-signing.keystore) e versionCode incrementale
const keystoreFile = path.join(__dirname, 'bar4torri-signing.keystore');
if (!fs.existsSync(keystoreFile)) {
  console.log('ℹ️ Generazione chiave di firma bar4torri-signing.keystore...');
  execFileSync('keytool', [
    '-genkeypair', '-noprompt',
    '-keystore', keystoreFile,
    '-storetype', 'PKCS12',
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-alias', 'bar4torri',
    '-storepass', 'bar4torri1948',
    '-keypass', 'bar4torri1948',
    '-dname', 'CN=Loiodice Michele, OU=Bar 4 Torri, O=Bar 4 Torri, L=Ferrara, ST=Emilia-Romagna, C=IT'
  ]);
}

if (fs.existsSync(appGradlePath)) {
  let gradle = fs.readFileSync(appGradlePath, 'utf8');
  const runNum = parseInt(process.env.GITHUB_RUN_NUMBER || '0', 10);
  const versionCode = runNum > 0 ? (170 + runNum) : (Math.floor(Date.now() / 60000) - 29000000);
  const versionName = runNum > 0 ? `1.7.${runNum}` : '1.7.0';

  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);

  if (!gradle.includes('bar4torri-signing.keystore')) {
    const signingBlock = `    signingConfigs {
        bar4torri {
            storeFile file('../../bar4torri-signing.keystore')
            storePassword 'bar4torri1948'
            keyAlias 'bar4torri'
            keyPassword 'bar4torri1948'
        }
    }
    buildTypes {`;
    gradle = gradle.replace(/buildTypes\s*\{/, signingBlock);
    gradle = gradle.replace(
      /release\s*\{/,
      `debug {
            signingConfig signingConfigs.bar4torri
        }
        release {
            signingConfig signingConfigs.bar4torri`
    );
  }
  fs.writeFileSync(appGradlePath, gradle, 'utf8');
  console.log(`✅ Firma fissa configurata in android/app/build.gradle (versionCode=${versionCode}, versionName=${versionName})`);
}

// 2. Copia Icone Launcher e Splash Screen nelle risorse native Android (res/)
const icon512 = path.join(__dirname, 'public', 'icon-512.png');
const icon192 = path.join(__dirname, 'public', 'icon-192.png');
const iconFg = path.join(__dirname, 'public', 'icon-foreground.png');
const splashSrc = path.join(__dirname, 'public', 'splash-screen.png');

const mipmapFolders = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
for (const folder of mipmapFolders) {
  const dir = path.join(resDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  const srcFile = (folder === 'mipmap-xxxhdpi' || folder === 'mipmap-xxhdpi') ? icon512 : icon192;
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, path.join(dir, 'ic_launcher.png'));
    fs.copyFileSync(srcFile, path.join(dir, 'ic_launcher_round.png'));
  }
  if (fs.existsSync(iconFg)) {
    fs.copyFileSync(iconFg, path.join(dir, 'ic_launcher_foreground.png'));
  }
}

const valuesDir = path.join(resDir, 'values');
fs.mkdirSync(valuesDir, { recursive: true });
fs.writeFileSync(
  path.join(valuesDir, 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#171A1E</color>\n</resources>\n`,
  'utf8'
);

if (fs.existsSync(splashSrc)) {
  const drawableDirs = ['drawable', 'drawable-port-hdpi', 'drawable-port-xhdpi', 'drawable-port-xxhdpi', 'drawable-port-xxxhdpi'];
  for (const d of drawableDirs) {
    const targetDir = path.join(resDir, d);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(splashSrc, path.join(targetDir, 'splash.png'));
  }
}
console.log('✅ Icona Bar 4 Torri e Splash Screen copiati in android/app/src/main/res');

// 2B. Configura res/xml/file_paths.xml con cache-path per condivisione nativa PDF e JSON
const xmlDir = path.join(resDir, 'xml');
fs.mkdirSync(xmlDir, { recursive: true });
fs.writeFileSync(
  path.join(xmlDir, 'file_paths.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n    <cache-path name="cache" path="." />\n    <files-path name="files" path="." />\n    <external-path name="external" path="." />\n    <external-files-path name="external_files" path="." />\n</paths>\n`,
  'utf8'
);
console.log('✅ Configurato res/xml/file_paths.xml');

// 3. Generazione NativeNfcPlugin.java
fs.mkdirSync(javaPkgDir, { recursive: true });

const nativeNfcJava = `package com.bar4torri.pos.offline;

import android.app.Activity;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CapacitorNfc")
public class NativeNfcPlugin extends Plugin {
    private boolean isScanning = false;

    @PluginMethod
    public void isSupported(PluginCall call) {
        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(getContext());
        JSObject ret = new JSObject();
        ret.put("supported", adapter != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(getContext());
        JSObject ret = new JSObject();
        if (adapter == null) {
            ret.put("status", "NO_NFC");
        } else if (!adapter.isEnabled()) {
            ret.put("status", "NFC_DISABLED");
        } else {
            ret.put("status", "NFC_OK");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void startScanning(PluginCall call) {
        isScanning = true;
        enableReader();
        call.resolve();
    }

    @PluginMethod
    public void stopScanning(PluginCall call) {
        isScanning = false;
        disableReader();
        call.resolve();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (isScanning) {
            enableReader();
        }
    }

    @Override
    protected void handleOnPause() {
        disableReader();
        super.handleOnPause();
    }

    private void enableReader() {
        Activity activity = getActivity();
        if (activity == null) return;
        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(activity);
        if (adapter == null || !adapter.isEnabled()) return;

        int flags = NfcAdapter.FLAG_READER_NFC_A
                | NfcAdapter.FLAG_READER_NFC_B
                | NfcAdapter.FLAG_READER_NFC_F
                | NfcAdapter.FLAG_READER_NFC_V
                | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;

        activity.runOnUiThread(() -> {
            try {
                adapter.enableReaderMode(activity, this::onTagDiscovered, flags, null);
            } catch (Exception ignored) {}
        });
    }

    private void disableReader() {
        Activity activity = getActivity();
        if (activity == null) return;
        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(activity);
        if (adapter == null) return;

        activity.runOnUiThread(() -> {
            try {
                adapter.disableReaderMode(activity);
            } catch (Exception ignored) {}
        });
    }

    private void onTagDiscovered(Tag tag) {
        if (!isScanning || tag == null) return;
        byte[] idBytes = tag.getId();
        String uid = bytesToHexUid(idBytes);
        if (!uid.isEmpty()) {
            JSObject data = new JSObject();
            data.put("uid", uid);
            notifyListeners("nfcEvent", data);
        }
    }

    private static String bytesToHexUid(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < bytes.length; i++) {
            if (i > 0) sb.append(":");
            sb.append(String.format("%02X", bytes[i] & 0xFF));
        }
        return sb.toString();
    }
}
`;

fs.writeFileSync(path.join(javaPkgDir, 'NativeNfcPlugin.java'), nativeNfcJava, 'utf8');
console.log('✅ Creato NativeNfcPlugin.java');

// 4. Generazione NativeFilePlugin.java (Salvataggio in Download + Condivisione nativa Android)
const nativeFileJava = `package com.bar4torri.pos.offline;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "NativeFile")
public class NativeFilePlugin extends Plugin {

    @PluginMethod
    public void saveFile(PluginCall call) {
        String filename = call.getString("filename", "report_bar4torri.pdf");
        String base64 = call.getString("base64", "");
        String mimeType = call.getString("mimeType", "application/pdf");

        if (base64 == null || base64.isEmpty()) {
            call.reject("Contenuto file vuoto");
            return;
        }

        try {
            String cleanB64 = base64.contains(",") ? base64.substring(base64.indexOf(",") + 1) : base64;
            byte[] data = Base64.decode(cleanB64, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Bar4Torri");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                ContentResolver resolver = getContext().getContentResolver();
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    call.reject("Impossibile creare il file nella cartella Download");
                    return;
                }
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out != null) {
                        out.write(data);
                        out.flush();
                    }
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, values, null, null);

                JSObject ret = new JSObject();
                ret.put("path", "Download/Bar4Torri/" + filename);
                ret.put("uri", uri.toString());
                call.resolve(ret);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Bar4Torri");
                if (!dir.exists()) dir.mkdirs();
                File outFile = new File(dir, filename);
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    fos.write(data);
                    fos.flush();
                }
                MediaScannerConnection.scanFile(getContext(), new String[]{outFile.getAbsolutePath()}, new String[]{mimeType}, null);

                JSObject ret = new JSObject();
                ret.put("path", "Download/Bar4Torri/" + filename);
                ret.put("uri", Uri.fromFile(outFile).toString());
                call.resolve(ret);
            }
        } catch (Exception e) {
            call.reject("Errore salvataggio file: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String filename = call.getString("filename", "report_bar4torri.pdf");
        String base64 = call.getString("base64", "");
        String mimeType = call.getString("mimeType", "application/pdf");
        String title = call.getString("title", "Condividi Report Bar 4 Torri");
        String text = call.getString("text", "Report movimenti cassa Bar 4 Torri");

        if (base64 == null || base64.isEmpty()) {
            call.reject("Contenuto file vuoto");
            return;
        }

        try {
            String cleanB64 = base64.contains(",") ? base64.substring(base64.indexOf(",") + 1) : base64;
            byte[] data = Base64.decode(cleanB64, Base64.DEFAULT);

            File outFile = new File(getContext().getCacheDir(), filename);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(data);
                fos.flush();
            }

            String authority = getContext().getPackageName() + ".fileprovider";
            Uri contentUri = FileProvider.getUriForFile(getContext(), authority, outFile);

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            shareIntent.putExtra(Intent.EXTRA_TEXT, text);
            shareIntent.setClipData(ClipData.newRawUri(title, contentUri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            call.resolve();
        } catch (Exception e) {
            call.reject("Errore condivisione file: " + e.getMessage(), e);
        }
    }
}
`;

fs.writeFileSync(path.join(javaPkgDir, 'NativeFilePlugin.java'), nativeFileJava, 'utf8');
console.log('✅ Creato NativeFilePlugin.java');

// 5. Generazione LiveUpdatePlugin.java (Aggiornamento Live da ZIP locale o GitHub senza reinstallare APK)
const liveUpdateJava = `package com.bar4torri.pos.offline;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "LiveUpdate")
public class LiveUpdatePlugin extends Plugin {
    private static final String LIVE_DIR_NAME = "live_bundle";
    private static final String STAGING_DIR_NAME = "live_staging";
    private static final String CAP_PREFS = "CapWebViewSettings";
    private static final String CAP_BASE_PATH_KEY = "serverBasePath";
    private static final String META_PREFS = "Bar4TorriLiveMeta";

    @PluginMethod
    public void getBundleInfo(PluginCall call) {
        File liveDir = new File(getContext().getFilesDir(), LIVE_DIR_NAME);
        File indexFile = new File(liveDir, "index.html");
        SharedPreferences capPrefs = getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE);
        SharedPreferences metaPrefs = getContext().getSharedPreferences(META_PREFS, Context.MODE_PRIVATE);
        String activePath = capPrefs.getString(CAP_BASE_PATH_KEY, "");
        boolean isLiveActive = activePath != null && !activePath.isEmpty() && indexFile.exists();

        JSObject ret = new JSObject();
        ret.put("isLiveActive", isLiveActive);
        ret.put("updatedAt", metaPrefs.getString("updatedAt", ""));
        ret.put("sourceLabel", metaPrefs.getString("sourceLabel", "Versione Integrata APK"));
        call.resolve(ret);
    }

    @PluginMethod
    public void applyZipUpdate(PluginCall call) {
        String base64 = call.getString("base64", "");
        String sourceLabel = call.getString("sourceLabel", "Pacchetto ZIP Locale");
        if (base64 == null || base64.isEmpty()) {
            call.reject("Archivio ZIP vuoto");
            return;
        }
        try {
            String cleanB64 = base64.contains(",") ? base64.substring(base64.indexOf(",") + 1) : base64;
            byte[] zipBytes = Base64.decode(cleanB64, Base64.DEFAULT);
            installZipBytesAndReload(zipBytes, sourceLabel);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("sourceLabel", sourceLabel);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Errore aggiornamento ZIP: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void updateFromGitHub(PluginCall call) {
        String repo = call.getString("repo", "Giudic3/Bar-4T").trim();
        String branch = call.getString("branch", "main").trim();
        String token = call.getString("token", "").trim();

        if (repo.isEmpty()) repo = "Giudic3/Bar-4T";
        repo = repo.replaceAll("\\s+", "-");
        if (!repo.contains("/")) repo = "Giudic3/" + repo;
        if (branch.isEmpty()) branch = "main";

        final String finalRepo = repo;
        final String finalBranch = branch;
        final String finalToken = token;
        new Thread(() -> {
            try {
                String zipUrl = "https://api.github.com/repos/" + finalRepo + "/zipball/" + finalBranch;
                byte[] zipBytes = downloadWithRedirects(zipUrl, finalToken, 5);
                String label = "GitHub (" + finalRepo + "@" + finalBranch + ")";
                installZipBytesAndReload(zipBytes, label);
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("sourceLabel", label);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Errore download da GitHub: " + e.getMessage(), e);
            }
        }).start();
    }

    @PluginMethod
    public void resetToBuiltIn(PluginCall call) {
        try {
            File liveDir = new File(getContext().getFilesDir(), LIVE_DIR_NAME);
            deleteRecursive(liveDir);

            SharedPreferences capPrefs = getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE);
            capPrefs.edit().remove(CAP_BASE_PATH_KEY).apply();

            SharedPreferences metaPrefs = getContext().getSharedPreferences(META_PREFS, Context.MODE_PRIVATE);
            metaPrefs.edit().clear().apply();

            if (getActivity() != null && getBridge() != null) {
                getActivity().runOnUiThread(() -> {
                    getBridge().setServerBasePath("");
                });
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Errore ripristino versione integrata: " + e.getMessage(), e);
        }
    }

    private byte[] downloadWithRedirects(String urlStr, String token, int maxRedirects) throws Exception {
        String currentUrl = urlStr;
        for (int i = 0; i < maxRedirects; i++) {
            URL url = new URL(currentUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(25000);
            conn.setRequestProperty("User-Agent", "Bar4TorriPOS-Android");
            conn.setRequestProperty("Accept", "application/vnd.github+json");
            if (token != null && !token.isEmpty() && currentUrl.contains("api.github.com")) {
                conn.setRequestProperty("Authorization", "Bearer " + token);
            }
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM || code == HttpURLConnection.HTTP_MOVED_TEMP || code == 307 || code == 308) {
                String next = conn.getHeaderField("Location");
                conn.disconnect();
                if (next == null || next.isEmpty()) throw new Exception("Redirect senza destinazione");
                currentUrl = next;
                continue;
            }
            if (code != HttpURLConnection.HTTP_OK) {
                conn.disconnect();
                if (code == 404) throw new Exception("Repository o branch non trovato (404). Se il repo e' privato inserisci il Token GitHub.");
                throw new Exception("HTTP " + code);
            }
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int len;
                while ((len = in.read(buf)) != -1) {
                    bos.write(buf, 0, len);
                }
                conn.disconnect();
                return bos.toByteArray();
            }
        }
        throw new Exception("Troppi redirect durante il download");
    }

    private void installZipBytesAndReload(byte[] zipBytes, String sourceLabel) throws Exception {
        File filesDir = getContext().getFilesDir();
        File stagingDir = new File(filesDir, STAGING_DIR_NAME);
        deleteRecursive(stagingDir);
        if (!stagingDir.mkdirs()) {
            throw new Exception("Impossibile creare directory temporanea");
        }

        String stagingCanonical = stagingDir.getCanonicalPath() + File.separator;
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                String name = entry.getName();
                if (name.startsWith("__MACOSX") || name.endsWith(".DS_Store")) continue;
                File outFile = new File(stagingDir, name);
                if (!outFile.getCanonicalPath().startsWith(stagingCanonical)) {
                    throw new Exception("Percorso ZIP non valido");
                }
                File parent = outFile.getParentFile();
                if (parent != null && !parent.exists()) parent.mkdirs();
                try (FileOutputStream fos = new FileOutputStream(outFile)) {
                    int len;
                    while ((len = zis.read(buffer)) > 0) {
                        fos.write(buffer, 0, len);
                    }
                }
                zis.closeEntry();
            }
        }

        File webRoot = findWebRoot(stagingDir);
        if (webRoot == null || !new File(webRoot, "index.html").exists()) {
            deleteRecursive(stagingDir);
            throw new Exception("Il pacchetto ZIP non contiene index.html");
        }

        File liveDir = new File(filesDir, LIVE_DIR_NAME);
        if (!liveDir.exists()) liveDir.mkdirs();

        // Copia gli asset mancanti dall'APK integrato (es. splash, icone, manuale PDF) se lo ZIP contiene solo index.html
        copyMissingBuiltInAssets(liveDir);

        // Copia i file aggiornati sopra liveDir
        copyDirectoryOverwrite(webRoot, liveDir);
        deleteRecursive(stagingDir);

        String nowStr = new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.ITALY).format(new Date());
        SharedPreferences capPrefs = getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE);
        capPrefs.edit().putString(CAP_BASE_PATH_KEY, liveDir.getAbsolutePath()).apply();

        SharedPreferences metaPrefs = getContext().getSharedPreferences(META_PREFS, Context.MODE_PRIVATE);
        metaPrefs.edit()
                .putString("updatedAt", nowStr)
                .putString("sourceLabel", sourceLabel)
                .apply();

        if (getActivity() != null && getBridge() != null) {
            getActivity().runOnUiThread(() -> {
                getBridge().setServerBasePath(liveDir.getAbsolutePath());
            });
        }
    }

    private File findWebRoot(File root) {
        File directIndex = new File(root, "index.html");
        if (directIndex.exists() && directIndex.length() > 500) {
            return root;
        }
        File publicIndex = new File(root, "public/index.html");
        if (publicIndex.exists() && publicIndex.length() > 500) {
            return new File(root, "public");
        }
        File[] children = root.listFiles();
        if (children != null) {
            for (File child : children) {
                if (child.isDirectory()) {
                    File found = findWebRoot(child);
                    if (found != null) return found;
                }
            }
        }
        return null;
    }

    private void copyMissingBuiltInAssets(File targetDir) {
        try {
            AssetManager am = getContext().getAssets();
            String[] assets = am.list("public");
            if (assets == null) return;
            byte[] buf = new byte[8192];
            for (String name : assets) {
                File dest = new File(targetDir, name);
                if (dest.exists()) continue;
                try (InputStream in = am.open("public/" + name); FileOutputStream out = new FileOutputStream(dest)) {
                    int len;
                    while ((len = in.read(buf)) > 0) {
                        out.write(buf, 0, len);
                    }
                } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {}
    }

    private void copyDirectoryOverwrite(File src, File dst) throws Exception {
        if (!dst.exists()) dst.mkdirs();
        File[] files = src.listFiles();
        if (files == null) return;
        byte[] buf = new byte[8192];
        for (File f : files) {
            File target = new File(dst, f.getName());
            if (f.isDirectory()) {
                copyDirectoryOverwrite(f, target);
            } else {
                try (FileInputStream in = new FileInputStream(f); FileOutputStream out = new FileOutputStream(target)) {
                    int len;
                    while ((len = in.read(buf)) > 0) {
                        out.write(buf, 0, len);
                    }
                }
            }
        }
    }

    private void deleteRecursive(File fileOrDir) {
        if (fileOrDir == null || !fileOrDir.exists()) return;
        if (fileOrDir.isDirectory()) {
            File[] children = fileOrDir.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        fileOrDir.delete();
    }
}
`;

fs.writeFileSync(path.join(javaPkgDir, 'LiveUpdatePlugin.java'), liveUpdateJava, 'utf8');
console.log('✅ Creato LiveUpdatePlugin.java (Aggiornamento Live da ZIP e da GitHub)');

// 6. Aggiornamento MainActivity.java (registra NativeNfcPlugin + NativeFilePlugin + LiveUpdatePlugin + fotocamera QR)
const mainActivityJava = `package com.bar4torri.pos.offline;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeNfcPlugin.class);
        registerPlugin(NativeFilePlugin.class);
        registerPlugin(LiveUpdatePlugin.class);
        super.onCreate(savedInstanceState);

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, 1001);
        }

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> request.grant(request.getResources()));
                }
            });
        }
    }
}
`;

fs.writeFileSync(path.join(javaPkgDir, 'MainActivity.java'), mainActivityJava, 'utf8');
console.log('✅ Aggiornato MainActivity.java (NFC + PDF/File + LiveUpdate + Fotocamera QR)');
