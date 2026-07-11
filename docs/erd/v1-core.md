erDiagram
  ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : has
  USERS ||--o{ ORGANIZATION_MEMBERS : joins
  USERS ||--o{ EXTERNAL_IDENTITIES : has

  ORGANIZATIONS ||--o{ CUSTOMERS : owns
  ORGANIZATIONS ||--o{ CONTACTS : owns
  ORGANIZATIONS ||--o{ ADDRESSES : owns
  CUSTOMERS ||--o{ CUSTOMER_CONTACTS : links
  CONTACTS ||--o{ CUSTOMER_CONTACTS : assigned

  ORGANIZATIONS ||--o{ PROJECTS : owns
  PROJECTS ||--o{ PROJECT_CUSTOMERS : links
  CUSTOMERS ||--o{ PROJECT_CUSTOMERS : assigned
  PROJECTS ||--o{ PROJECT_MEMBERS : has
  USERS ||--o{ PROJECT_MEMBERS : assigned

  PROJECTS ||--o{ TASKS : contains
  TASKS ||--o{ NOTES : has
  PROJECTS ||--o{ ACTIVITIES : logs

  ORGANIZATIONS {
    uuid id PK
    string name
  }

  USERS {
    uuid id PK
    string email
    string display_name
  }

  EXTERNAL_IDENTITIES {
    uuid id PK
    uuid user_id FK
    string provider
    string external_id
  }

  ORGANIZATION_MEMBERS {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    string role
  }

  CUSTOMERS {
    uuid id PK
    uuid organization_id FK
    string name
    string status
  }

  CONTACTS {
    uuid id PK
    uuid organization_id FK
    string email
    string full_name
  }

  ADDRESSES {
    uuid id PK
    uuid organization_id FK
    string label
    string city
  }

  CUSTOMER_CONTACTS {
    uuid id PK
    uuid customer_id FK
    uuid contact_id FK
  }

  PROJECTS {
    uuid id PK
    uuid organization_id FK
    string name
    string status
  }

  PROJECT_CUSTOMERS {
    uuid id PK
    uuid project_id FK
    uuid customer_id FK
  }

  PROJECT_MEMBERS {
    uuid id PK
    uuid project_id FK
    uuid user_id FK
    string role
  }

  TASKS {
    uuid id PK
    uuid project_id FK
    string title
    string status
  }

  NOTES {
    uuid id PK
    uuid task_id FK
    uuid author_id FK
    text content
  }

  ACTIVITIES {
    uuid id PK
    uuid project_id FK
    string type
    timestamp occurred_at
  }
