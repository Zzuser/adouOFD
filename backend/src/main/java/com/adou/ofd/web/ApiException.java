package com.adou.ofd.web;

public class ApiException extends RuntimeException {

    private final int status;
    private final String code;
    private final String detail;

    public ApiException(int status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiException(int status, String code, String message, String detail) {
        super(message);
        this.status = status;
        this.code = code;
        this.detail = detail;
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public String getDetail() {
        return detail;
    }
}
