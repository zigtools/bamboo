/*
  Warnings:

  - The primary key for the `Branch` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Branch` table. All the data in the column will be lost.
  - You are about to drop the column `repoId` on the `Branch` table. All the data in the column will be lost.
  - The primary key for the `Commit` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `branchId` on the `Commit` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `Commit` table. All the data in the column will be lost.
  - You are about to drop the column `commitId` on the `Entry` table. All the data in the column will be lost.
  - The primary key for the `Repo` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Repo` table. All the data in the column will be lost.
  - You are about to drop the column `repo` on the `Repo` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[owner,repoName,name]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[owner,repoName,branchName,hash]` on the table `Commit` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[owner,name]` on the table `Repo` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `owner` to the `Branch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `repoName` to the `Branch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchName` to the `Commit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `owner` to the `Commit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `repoName` to the `Commit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchName` to the `Entry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `commitHash` to the `Entry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `owner` to the `Entry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `repoName` to the `Entry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Repo` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Branch" DROP CONSTRAINT "Branch_repoId_fkey";

-- DropForeignKey
ALTER TABLE "Commit" DROP CONSTRAINT "Commit_branchId_fkey";

-- DropForeignKey
ALTER TABLE "Entry" DROP CONSTRAINT "Entry_commitId_fkey";

-- AlterTable
ALTER TABLE "Branch" DROP CONSTRAINT "Branch_pkey",
DROP COLUMN "id",
DROP COLUMN "repoId",
ADD COLUMN     "owner" TEXT NOT NULL,
ADD COLUMN     "repoName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Commit" DROP CONSTRAINT "Commit_pkey",
DROP COLUMN "branchId",
DROP COLUMN "id",
ADD COLUMN     "branchName" TEXT NOT NULL,
ADD COLUMN     "owner" TEXT NOT NULL,
ADD COLUMN     "repoName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Entry" DROP COLUMN "commitId",
ADD COLUMN     "branchName" TEXT NOT NULL,
ADD COLUMN     "commitHash" TEXT NOT NULL,
ADD COLUMN     "owner" TEXT NOT NULL,
ADD COLUMN     "repoName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Repo" DROP CONSTRAINT "Repo_pkey",
DROP COLUMN "id",
DROP COLUMN "repo",
ADD COLUMN     "name" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_owner_repoName_name_key" ON "Branch"("owner", "repoName", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Commit_owner_repoName_branchName_hash_key" ON "Commit"("owner", "repoName", "branchName", "hash");

-- CreateIndex
CREATE UNIQUE INDEX "Repo_owner_name_key" ON "Repo"("owner", "name");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_owner_repoName_fkey" FOREIGN KEY ("owner", "repoName") REFERENCES "Repo"("owner", "name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commit" ADD CONSTRAINT "Commit_owner_repoName_branchName_fkey" FOREIGN KEY ("owner", "repoName", "branchName") REFERENCES "Branch"("owner", "repoName", "name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_owner_repoName_branchName_commitHash_fkey" FOREIGN KEY ("owner", "repoName", "branchName", "commitHash") REFERENCES "Commit"("owner", "repoName", "branchName", "hash") ON DELETE RESTRICT ON UPDATE CASCADE;
