package com.jcs.tnme;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.zip.Inflater;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class JwpubCrypto {
    private static final byte[] XOR_KEY = hexToBytes(
        "11cbb5587e32846d4c26790c633da289f66fe5842a3a585ce1bc3a294af5ada7");

    private JwpubCrypto() {}

    static byte[] deriveKeyIv(String lang, String symbol, String year, String issue) {
        StringBuilder joined = new StringBuilder();
        joined.append(lang).append('_').append(symbol).append('_').append(year);
        if (issue != null && issue.length() > 0 && !"0".equals(issue)) {
            try {
                if (Integer.parseInt(issue) != 0) {
                    joined.append('_').append(issue);
                }
            } catch (NumberFormatException ignored) {
                joined.append('_').append(issue);
            }
        }

        byte[] hash = sha256(joined.toString().getBytes(StandardCharsets.UTF_8));
        byte[] keyIv = new byte[32];
        for (int i = 0; i < 32; i++) {
            keyIv[i] = (byte) (hash[i] ^ XOR_KEY[i]);
        }
        return keyIv;
    }

    static String decryptContent(byte[] keyIv, byte[] encrypted) throws Exception {
        SecretKeySpec keySpec = new SecretKeySpec(keyIv, 0, 16, "AES");
        IvParameterSpec ivSpec = new IvParameterSpec(keyIv, 16, 16);
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, keySpec, ivSpec);
        byte[] decrypted = cipher.doFinal(encrypted);

        Inflater inflater = new Inflater();
        inflater.setInput(decrypted);
        byte[] buffer = new byte[Math.max(decrypted.length * 4, 8192)];
        int length = inflater.inflate(buffer);
        inflater.end();
        return new String(buffer, 0, length, StandardCharsets.UTF_8);
    }

    private static byte[] sha256(byte[] input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return digest.digest(input);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] out = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            out[i / 2] = (byte) Integer.parseInt(hex.substring(i, i + 2), 16);
        }
        return out;
    }
}
