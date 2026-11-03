package com.adou.ofd.server;

import com.adou.ofd.convert.ConversionEngine;
import com.adou.ofd.convert.ConversionRequest;
import com.adou.ofd.convert.ConversionService;
import com.adou.ofd.convert.HeavyTaskExecutor;
import com.adou.ofd.convert.ProbeRequest;
import com.adou.ofd.document.DemoOfdFactory;
import com.adou.ofd.document.DocumentService;
import com.adou.ofd.document.OpenRequest;
import com.adou.ofd.document.PdfDemoFactory;
import com.adou.ofd.document.TextRun;
import com.adou.ofd.merge.MergeEngine;
import com.adou.ofd.merge.MergeRequest;
import com.adou.ofd.merge.MergeService;
import com.adou.ofd.merge.OfdResourceRepair;
import com.adou.ofd.merge.OfdStyleRepair;
import com.adou.ofd.pages.InsertRequest;
import com.adou.ofd.pages.PageToolEngine;
import com.adou.ofd.pages.PageToolService;
import com.adou.ofd.pages.SplitRequest;
import com.adou.ofd.search.SearchRequest;
import com.adou.ofd.search.SearchService;
import com.adou.ofd.web.ApiError;
import com.adou.ofd.web.ApiException;
import com.adou.ofd.web.ApiToken;
import com.adou.ofd.web.Http;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.http.HttpResponseException;
import io.javalin.json.JavalinJackson;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 本地 HTTP 引擎：Javalin + Jetty，只绑定 127.0.0.1。
 *
 * <p>服务层不依赖 Web 框架，本类负责依赖装配、路由、Token 校验与错误映射。
 * 启动参数：--server.port、--adou.token；就绪后向 stdout 输出 ADOU_ENGINE_READY。
 */
public final class AdouServer {

    private static final Logger log = LoggerFactory.getLogger(AdouServer.class);
    private static final String READY_MARKER = "ADOU_ENGINE_READY";
    private static final String JAVALIN_VERSION = "6.7.0";
    private static final String OFDRW_VERSION = "2.5.1";
    private static final String PNG_CACHE_CONTROL = "private, max-age=300";

    private AdouServer() {
    }

    public static void main(String[] args) throws InterruptedException {
        System.setProperty("java.awt.headless", "true");

        Args parsed = Args.parse(args);
        String version = Optional
                .ofNullable(AdouServer.class.getPackage().getImplementationVersion())
                .orElse("1.0.0");

        DemoOfdFactory demoFactory = new DemoOfdFactory();
        DocumentService documents = new DocumentService(demoFactory, new PdfDemoFactory(version));
        ConversionEngine conversionEngine = new ConversionEngine();
        HeavyTaskExecutor executor = new HeavyTaskExecutor();
        ConversionService conversions = new ConversionService(documents, conversionEngine, executor);
        OfdResourceRepair resourceRepair = new OfdResourceRepair();
        OfdStyleRepair styleRepair = new OfdStyleRepair();
        MergeService merges = new MergeService(conversionEngine,
                new MergeEngine(conversionEngine, resourceRepair, styleRepair), executor);
        PageToolService pageTools = new PageToolService(conversionEngine,
                new PageToolEngine(conversionEngine, resourceRepair, styleRepair), executor);
        SearchService searches = new SearchService(documents);

        Javalin app = createApp(documents, conversions, merges, pageTools, searches,
                parsed.token(), version);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            documents.closeAll();
            searches.shutdown();
            executor.shutdown();
        }, "adou-engine-shutdown-hook"));

        app.start(parsed.port());
        System.out.println(READY_MARKER);
        System.out.flush();

        Thread.currentThread().join();
    }

    private static Javalin createApp(DocumentService documents, ConversionService conversions,
                                     MergeService merges, PageToolService pageTools,
                                     SearchService searches, String token, String version) {
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        mapper.disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

        Javalin app = Javalin.create(config -> {
            config.showJavalinBanner = false;
            config.jsonMapper(new JavalinJackson(mapper, false));
            config.bundledPlugins.enableCors(cors -> cors.addRule(rule -> rule.anyHost()));
        });

        app.before("/api/*", ctx -> {
            if ("OPTIONS".equalsIgnoreCase(ctx.method().name())) {
                return;
            }
            String provided = ctx.header("X-ADou-Token");
            if (provided == null || provided.isBlank()) {
                provided = ctx.queryParam("token");
            }
            if (!ApiToken.matches(token, provided)) {
                throw new ApiException(Http.UNAUTHORIZED, "UNAUTHORIZED", "本地引擎访问令牌无效");
            }
        });

        Instant startedAt = Instant.now();
        app.get("/api/health", ctx -> ctx.json(new HealthResponse(
                "UP",
                "阿豆OFD",
                version,
                System.getProperty("java.version"),
                OFDRW_VERSION,
                "Javalin " + JAVALIN_VERSION,
                System.getProperty("os.name") + " " + System.getProperty("os.version")
                        + " (" + System.getProperty("os.arch") + ")",
                startedAt.toString())));

        app.post("/api/system/shutdown", ctx -> {
            ctx.json(Map.of("status", "closing"));
            Thread thread = new Thread(() -> {
                sleep(200);
                app.stop();
                System.exit(0);
            }, "adou-engine-shutdown");
            thread.setDaemon(false);
            thread.start();
        });

        // 文档：静态路径先注册，避免被 {id} 抢占
        app.post("/api/documents/open", ctx -> {
            OpenRequest request = maybeBody(ctx, OpenRequest.class);
            if (request == null) {
                throw new ApiException(Http.BAD_REQUEST, "INVALID_PATH", "请提供 OFD 文件路径");
            }
            ctx.json(documents.open(request.path(), request.password()));
        });
        app.post("/api/documents/demo", ctx -> ctx.json(documents.openDemo()));
        app.post("/api/documents/demo/pdf", ctx -> ctx.json(documents.openPdfDemo()));
        app.get("/api/documents/{id}", ctx -> ctx.json(documents.summary(ctx.pathParam("id"))));
        app.get("/api/documents/{id}/properties",
                ctx -> ctx.json(documents.properties(ctx.pathParam("id"))));
        app.get("/api/documents/{id}/outline",
                ctx -> ctx.json(documents.outline(ctx.pathParam("id"))));
        app.get("/api/documents/{id}/pages/{page}", ctx -> {
            int dpi = queryInt(ctx, "dpi", 144);
            int rotate = queryInt(ctx, "rotate", 0);
            sendPng(ctx, documents.render(ctx.pathParam("id"), intParam(ctx, "page"), dpi, rotate));
        });
        app.get("/api/documents/{id}/pages/{page}/text", ctx -> {
            List<TextRun> runs = documents.pageText(ctx.pathParam("id"), intParam(ctx, "page"));
            ctx.json(runs);
        });
        app.delete("/api/documents/{id}", ctx -> {
            documents.close(ctx.pathParam("id"));
            ctx.status(204);
        });

        // 拆分/插页预览会话
        app.post("/api/previews", ctx -> {
            OpenRequest request = maybeBody(ctx, OpenRequest.class);
            if (request == null) {
                throw new ApiException(Http.BAD_REQUEST, "INVALID_PATH", "请提供 OFD 或 PDF 文件路径");
            }
            ctx.json(documents.openPreview(request.path()));
        });
        app.get("/api/previews/{id}/pages/{page}", ctx -> {
            int dpi = queryInt(ctx, "dpi", 24);
            sendPng(ctx, documents.renderPreview(ctx.pathParam("id"), intParam(ctx, "page"), dpi));
        });
        app.delete("/api/previews/{id}", ctx -> {
            documents.closePreview(ctx.pathParam("id"));
            ctx.status(204);
        });

        // 转换
        app.post("/api/conversions", ctx -> ctx.status(202)
                .json(conversions.submit(maybeBody(ctx, ConversionRequest.class))));
        app.get("/api/conversions", ctx -> ctx.json(conversions.list(queryInt(ctx, "limit", 20))));
        app.post("/api/conversions/probe", ctx -> {
            ProbeRequest request = maybeBody(ctx, ProbeRequest.class);
            ctx.json(conversions.probe(request == null ? null : request.paths()));
        });
        app.get("/api/conversions/{id}", ctx -> ctx.json(conversions.get(ctx.pathParam("id"))));
        app.post("/api/conversions/{id}/cancel",
                ctx -> ctx.json(conversions.cancel(ctx.pathParam("id"))));

        // 合并
        app.post("/api/merges", ctx -> ctx.status(202)
                .json(merges.submit(maybeBody(ctx, MergeRequest.class))));
        app.get("/api/merges", ctx -> ctx.json(merges.list(queryInt(ctx, "limit", 20))));
        app.get("/api/merges/{id}", ctx -> ctx.json(merges.get(ctx.pathParam("id"))));
        app.post("/api/merges/{id}/cancel", ctx -> ctx.json(merges.cancel(ctx.pathParam("id"))));

        // 拆分与插页
        app.post("/api/page-tools/splits", ctx -> ctx.status(202)
                .json(pageTools.submitSplit(maybeBody(ctx, SplitRequest.class))));
        app.post("/api/page-tools/inserts", ctx -> ctx.status(202)
                .json(pageTools.submitInsert(maybeBody(ctx, InsertRequest.class))));
        app.get("/api/page-tools", ctx -> ctx.json(pageTools.list(queryInt(ctx, "limit", 20))));
        app.get("/api/page-tools/{id}", ctx -> ctx.json(pageTools.get(ctx.pathParam("id"))));
        app.post("/api/page-tools/{id}/cancel",
                ctx -> ctx.json(pageTools.cancel(ctx.pathParam("id"))));

        // 全文搜索
        app.post("/api/documents/{id}/searches", ctx -> ctx.status(202).json(
                searches.submit(ctx.pathParam("id"), maybeBody(ctx, SearchRequest.class))));
        app.get("/api/documents/{id}/searches/{searchId}", ctx -> ctx.json(
                searches.get(ctx.pathParam("id"), ctx.pathParam("searchId"))));
        app.post("/api/documents/{id}/searches/{searchId}/cancel", ctx -> ctx.json(
                searches.cancel(ctx.pathParam("id"), ctx.pathParam("searchId"))));

        app.exception(ApiException.class, (error, ctx) -> ctx.status(error.getStatus())
                .json(new ApiError(error.getCode(), error.getMessage(), error.getDetail())));
        app.exception(Exception.class, (error, ctx) -> {
            if (error instanceof HttpResponseException http) {
                ctx.status(http.getStatus());
                return;
            }
            log.error("未处理的引擎异常", error);
            ctx.status(Http.INTERNAL_SERVER_ERROR).json(new ApiError(
                    "INTERNAL_ERROR", "本地引擎处理失败，请查看日志", error.getMessage()));
        });

        return app;
    }

    private static void sendPng(Context ctx, Path png) throws IOException {
        ctx.header("Cache-Control", PNG_CACHE_CONTROL);
        ctx.contentType("image/png");
        ctx.result(Files.readAllBytes(png));
    }

    private static int intParam(Context ctx, String name) {
        return Integer.parseInt(ctx.pathParam(name));
    }

    private static int queryInt(Context ctx, String name, int fallback) {
        String raw = ctx.queryParam(name);
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    private static <T> T maybeBody(Context ctx, Class<T> type) {
        String body = ctx.body();
        return body == null || body.isBlank() ? null : ctx.bodyAsClass(type);
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }

    public record HealthResponse(
            String status,
            String app,
            String version,
            String javaVersion,
            String ofdrwVersion,
            String runtime,
            String os,
            String startedAt) {
    }

    private record Args(int port, String token) {
        static Args parse(String[] args) {
            int port = 0;
            String token = "";
            for (String arg : args) {
                if (arg.startsWith("--server.port=")) {
                    try {
                        port = Integer.parseInt(arg.substring("--server.port=".length()));
                    } catch (NumberFormatException ignored) {
                        port = 0;
                    }
                } else if (arg.startsWith("--adou.token=")) {
                    token = arg.substring("--adou.token=".length());
                }
            }
            return new Args(port, token);
        }
    }
}
