/*
  Warnings:

  - You are about to drop the column `summary` on the `Entry` table. All the data in the column will be lost.
  - Added the required column `summary` to the `Group` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Entry" DROP COLUMN "summary";

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "summary" TEXT NOT NULL;
