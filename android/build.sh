#!/bin/bash
# Builds the lite Android app into /tmp/apk/actes-catalogs.apk (downloads SDK tools if missing).
set -e; SRC=$(cd "$(dirname "$0")" && pwd); W=/tmp/apk; mkdir -p $W; cd $W
[ -d bt ] || { curl -sSLo bt.zip https://dl.google.com/android/repository/build-tools_r34-linux.zip; unzip -q bt.zip -d bt; }
[ -d pl ] || { curl -sSLo pl.zip https://dl.google.com/android/repository/platform-34-ext7_r03.zip; unzip -q pl.zip -d pl; }
J=$(nix build nixpkgs#openjdk17 --no-link --print-out-paths | tail -1)/bin; BT=bt/android-14; AJ=pl/android-34/android.jar
rm -rf assets cls gen; cp -r $SRC/assets .; cp $SRC/../node_modules/pdfjs-dist/legacy/build/pdf.min.mjs $SRC/../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs assets/web/
$BT/aapt2 compile --dir $SRC/res -o res.zip
$BT/aapt2 link -o base.apk -I $AJ --manifest $SRC/AndroidManifest.xml -A assets res.zip --java gen
mkdir cls; $J/javac -encoding UTF-8 -nowarn -source 8 -target 8 -bootclasspath $AJ -cp $AJ -d cls gen/com/actes/catalogs/R.java $SRC/src/com/actes/catalogs/MainActivity.java 2>&1 | grep -v "^warning\|^Note" || true
PATH=$J:$PATH $BT/d8 --min-api 24 --lib $AJ --output . $(find cls -name '*.class')
cp base.apk u.apk; zip -qj u.apk classes.dex; $BT/zipalign -f -p 4 u.apk a.apk
[ -f key.jks ] || $J/keytool -genkeypair -keystore key.jks -alias actes -storepass actes123 -keypass actes123 -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=ACTES"
PATH=$J:$PATH $BT/apksigner sign --ks key.jks --ks-pass pass:actes123 --out actes-catalogs.apk a.apk
ls -la actes-catalogs.apk
