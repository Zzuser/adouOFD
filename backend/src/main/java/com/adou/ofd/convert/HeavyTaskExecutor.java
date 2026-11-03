package com.adou.ofd.convert;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 转换与合并共用的单工作线程池：两类任务都会长时间占用 CPU/内存，
 * 串行执行可以避免同时跑两份大文档导致 OOM。
 */
public class HeavyTaskExecutor {

    private static final int MAX_QUEUE = 8;
    private static final AtomicInteger THREAD_SEQ = new AtomicInteger();

    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            1,
            1,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(MAX_QUEUE),
            runnable -> {
                Thread thread = new Thread(runnable, "adou-heavy-" + THREAD_SEQ.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            },
            new ThreadPoolExecutor.AbortPolicy());

    public Future<?> submit(Runnable task) {
        return executor.submit(task);
    }

    public void shutdown() {
        executor.shutdownNow();
    }
}
