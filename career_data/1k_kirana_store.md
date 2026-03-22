# Project: 1K Kirana Store

**Aliases / Known As:** 1K Kirana, Kirana, Kirana App

**Type:** B2B Retail Tech / E-commerce Platform
**Role:** Lead / Senior Full-Stack Developer
**Tech Stack:** React, Node.js, GraphQL, AWS EC2, PHP (Legacy)
**Status:** Completed / Production

## System Architecture & Design

### 1K Kirana Store Core Architecture

I led the end-to-end modernization of the **1K Kirana Store** platform, migrating it from a monolithic legacy PHP application to a highly scalable, modular **React** and **Node.js** architecture. The frontend utilizes a modular React architecture with strict component standards to ensure high reliability across the diverse array of mobile and web devices used by Kirana store owners.

### 1K Kirana Store Backend & Infrastructure

The backend of **1K Kirana Store** is powered by Node.js, exposing **GraphQL APIs** that allow for flexible and efficient data fetching for complex retail workflows. The business logic layer is decoupled into modular rule engines governing pricing, inventory, and promo codes. The entire infrastructure is deployed and managed natively on **AWS EC2** instances, successfully handling ~50,000 daily API requests and serving 400–500 Daily Active Users (DAU) and ~5,000 Monthly Active Users (MAU).

## Key Technical Challenges (Case Studies)

### Challenge 1: The Monolith to Micro-Architecture Migration

- **Situation:** The original **1K Kirana Store** platform was built on a legacy PHP architecture that became a bottleneck for feature delivery and could not reliably scale to meet growing user traffic.
- **Task:** I needed to migrate the entire stack to a modern React + Node.js architecture without disrupting the daily operations of active Kirana store owners.
- **Action:** I led a phased migration strategy. I designed the new Node.js and GraphQL APIs deployed on AWS EC2 to incrementally take over traffic from the PHP backend. On the frontend, I established modern architecture standards and built a scalable component library.
- **Result:** Successfully migrated the user base to the new infrastructure, reliably serving thousands of active users and processing ~50,000 daily API requests with zero downtime.

### Challenge 2: Transactional Consistency at Scale

- **Situation:** E-commerce operations for the **1K Kirana Store** retail network require absolute precision. Applying promo codes, updating shared inventory, and processing orders simultaneously easily led to race conditions under high concurrency on the old system.
- **Task:** Guarantee transactional consistency across all business workflows regardless of server load.
- **Action:** I architected modular business rule engines dedicated explicitly to pricing, inventory, and order workflows. By decoupling these domains, I ensured that database transactions were strictly isolated and locked appropriately during high-concurrency operations.
- **Result:** Maintained pristine data integrity for thousands of daily retail transactions, entirely eliminating phantom inventory issues and pricing discrepancies.

### Challenge 3: Team Velocity & Codebase Brittle-ness

- **Situation:** As the engineering team for **1K Kirana Store** grew, the lack of standardization in the frontend codebase led to bugs in production and slow feature delivery.
- **Task:** Improve overall application reliability while scaling the engineering team's output.
- **Action:** I took on a heavy mentorship role, guiding 4–5 junior developers. I established strict frontend architecture standards, enforced rigorous code reviews, and led a structured refactoring effort to break down monolithic views into highly modular, testable components.
- **Result:** Improved frontend reliability by ~20%, significantly reduced bug regressions, and accelerated overall delivery velocity by upskilling the junior engineering team into autonomous contributors.

## Engineering Trade-offs & Q&A

### Why did you choose GraphQL over REST for the 1K Kirana Store backend?

Retail platforms require highly relational, nested data (e.g., an Order contains Users, Products, Promo Codes, and Store details). I selected **GraphQL** because it prevented massive over-fetching and allowed the React frontend to request exact payloads. This drastically reduced mobile bandwidth consumption for Kirana store owners operating on poor network connections.

### Why did you deploy 1K Kirana Store on AWS EC2 instead of managed services?

I chose to deploy directly on **AWS EC2** (IaaS) to maintain granular control over the Node.js runtime environments, routing, and cost optimization during the early phases of the migration, rather than being locked into the constraints of a PaaS like Heroku or Elastic Beanstalk.

### If you were to scale 1K Kirana Store today, what infrastructure changes would you make?

While AWS EC2 provided great control initially, if I were to scale the platform to 50,000+ DAU today, I would migrate the deployment strategy to container orchestration using **Docker** and **Kubernetes (AWS EKS)** or AWS ECS. This would allow for better auto-scaling during retail rush hours and self-healing deployments compared to managing raw EC2 instances.
