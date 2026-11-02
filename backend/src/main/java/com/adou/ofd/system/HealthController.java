package com.adou.ofd.system;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringBootVersion;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api")
public class HealthController {

    private final String appVersion;
    private final String ofdrwVersion;
    private final String startedAt = Instant.now().toString();

    public HealthController(
            @Value("${adou.version:0.7.1}") String appVersion,
            @Value("${adou.ofdrw-version:2.5.1}") String ofdrwVersion) {
        this.appVersion = appVersion;
        this.ofdrwVersion = ofdrwVersion;
    }

    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse(
                "UP",
                "阿豆OFD",
                appVersion,
                System.getProperty("java.version"),
                ofdrwVersion,
                SpringBootVersion.getVersion(),
                System.getProperty("os.name") + " " + System.getProperty("os.version")
                        + " (" + System.getProperty("os.arch") + ")",
                startedAt);
    }

    public record HealthResponse(
            String status,
            String app,
            String version,
            String javaVersion,
            String ofdrwVersion,
            String springBootVersion,
            String os,
            String startedAt) {
    }
}
