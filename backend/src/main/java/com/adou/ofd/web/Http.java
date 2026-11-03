package com.adou.ofd.web;

/** 引擎使用的 HTTP 状态码，避免核心层依赖任何 Web 框架。 */
public final class Http {

    public static final int OK = 200;
    public static final int BAD_REQUEST = 400;
    public static final int UNAUTHORIZED = 401;
    public static final int NOT_FOUND = 404;
    public static final int CONFLICT = 409;
    public static final int UNSUPPORTED_MEDIA_TYPE = 415;
    public static final int UNPROCESSABLE_ENTITY = 422;
    public static final int TOO_MANY_REQUESTS = 429;
    public static final int INTERNAL_SERVER_ERROR = 500;

    private Http() {
    }
}
