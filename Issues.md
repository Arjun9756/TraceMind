# TraceMind System Challenges & Solutions

## 1. Database Bottleneck Due to FCFS Processing

At the starting phase of TraceMind, the system was using the FCFS (First Come First Serve) algorithm without any delay. Every request received from the business for any event was resolved instantly without buffering or batching.

The issue was generated at the database layer because for every single request there was a dedicated database insertion and for every insertion there was a separate acknowledgement response. This created massive pressure on the database layer which directly led to:

* Database failures
* Rate limiting issues from cloud database providers
* Increased latency
* Poor user experience

As soon as the user experience becomes bad, it directly impacts the business profit and overall system reliability.

### Solution

The solution I came up with was **Batch Processing** of the data.

Instead of inserting records one by one, the system started inserting bulk data of around **100–200 requests at once** into the database.

Benefits of this approach:

* Only one acknowledgement for bulk insertion
* Reduced network bandwidth usage
* Lower latency
* Reduced database stress
* Better throughput
* Smooth flow of the overall system

This optimization significantly improved the performance and stability of the database layer.

---

# 2. HTTP Protocol Bottleneck & Introduction of Kafka

At the initial phase of TraceMind, the servers were working fine. But as soon as the number of requests pushed by businesses increased, the HTTP protocol itself became a bottleneck for the server.

Even after applying the batch bulk queue processing system, the server was still unable to efficiently handle around **5000 requests per second** because:

* Large payloads were continuously streamed
* HTTP carried extra metadata overhead
* WebSocket communication increased memory consumption
* Server memory usage suddenly increased
* Database performance also started degrading

The actual problem was not accepting requests.
The real issue was handling **continuous large-scale streaming of data** at the HTTP layer.

### Solution

The solution I came up with was using **Kafka** — a distributed event streaming platform.

Kafka allowed the system to:

* Handle concurrent and simultaneous requests efficiently
* Process streaming data more reliably
* Reduce HTTP layer pressure
* Improve scalability
* Maintain system stability under heavy load

With Kafka, a single server architecture was able to handle around **1000–1500 requests per second** much more efficiently.

---

# 3. Kafka Consumer & WebSocket Multi-Process Issue

One of the major issues I faced with Kafka was related to process architecture.

The server was internally running **two separate process instances**:

1. Main Server Process

   * Kafka Producer
   * WebSocket Logic

2. Kafka Consumer Process

   * Kafka Consumer Groups

The businesses were pushing data to the main server, but the Kafka consumers were running in a completely different process.

This created a major issue:

* Two separate WebSocket connection instances were created
* One connection existed in the main server
* Another connection existed inside Kafka worker processes

As a result, the emitted events were happening inside the consumer process instead of the main server process.

That was the main reason why no real-time result was visible on the frontend even though everything was technically working correctly.

### Solution

As the codebase had already become very large, changing every file and architecture was not practical.

So instead of rewriting the complete system, I implemented a smart solution:

* Kafka worker groups were executed inside the main server itself
* The same WebSocket instance was shared
* Event emission started happening from the correct process
* Real-time communication started working properly again

This solved the issue without requiring a major architectural rewrite.
