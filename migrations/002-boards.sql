CREATE TABLE profile (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 500),
  avatar_color TEXT NOT NULL DEFAULT 'yellow' CHECK (avatar_color IN ('yellow', 'pink', 'blue', 'green', 'violet'))
);

CREATE TABLE board (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  color TEXT NOT NULL DEFAULT 'yellow' CHECK (color IN ('yellow', 'pink', 'blue', 'green', 'violet')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE board_member (
  board_id UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);
CREATE INDEX board_member_user_idx ON board_member(user_id);

CREATE TABLE board_column (
  id UUID PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  position INTEGER NOT NULL CHECK (position >= 0),
  is_done BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (id, board_id)
);
CREATE INDEX board_column_order_idx ON board_column(board_id, position);

CREATE TABLE task (
  id UUID PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  column_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  color TEXT NOT NULL DEFAULT 'yellow' CHECK (color IN ('yellow', 'pink', 'blue', 'green', 'violet')),
  position INTEGER NOT NULL CHECK (position >= 0),
  due_date DATE,
  assignee_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (column_id, board_id) REFERENCES board_column(id, board_id) ON DELETE CASCADE
);
CREATE INDEX task_column_order_idx ON task(board_id, column_id, position);

CREATE FUNCTION check_task_assignee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM board WHERE id = NEW.board_id AND owner_id = NEW.assignee_id
    UNION ALL
    SELECT 1 FROM board_member WHERE board_id = NEW.board_id AND user_id = NEW.assignee_id
  ) THEN
    RAISE EXCEPTION 'Assignee must belong to the board' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER task_assignee_membership BEFORE INSERT OR UPDATE OF assignee_id, board_id ON task
  FOR EACH ROW EXECUTE FUNCTION check_task_assignee();

CREATE FUNCTION clear_removed_member_assignments() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE task SET assignee_id = NULL, version = version + 1
    WHERE board_id = OLD.board_id AND assignee_id = OLD.user_id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER board_member_clear_assignments BEFORE DELETE ON board_member
  FOR EACH ROW EXECUTE FUNCTION clear_removed_member_assignments();

CREATE TABLE board_invite (
  id UUID PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  email TEXT CHECK (email IS NULL OR email = lower(email)),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX board_invite_board_idx ON board_invite(board_id);
CREATE INDEX board_invite_rate_idx ON board_invite(created_by, created_at);
CREATE INDEX board_invite_email_rate_idx ON board_invite(email, created_at);
