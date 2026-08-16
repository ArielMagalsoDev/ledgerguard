"""Pydantic request/response models for the API surface."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class InvoiceSubmissionIn(BaseModel):
    submissionId: str = Field(min_length=1)
    source: Literal["email", "upload", "shared_folder", "demo_scenario"]
    originalFileName: str = Field(min_length=1)
    fileHash: str = Field(min_length=1)
    mimeType: Literal["application/pdf", "image/png", "image/jpeg"]
    receivedAt: datetime
    senderEmail: EmailStr | None = None
    scenarioKey: str | None = Field(default=None, min_length=1)


class SubmitInvoiceOut(BaseModel):
    invoiceId: str
    workflowId: str
    status: str
    isReplay: bool


ROLES = ("property_manager", "regional_operations_manager", "finance_manager", "controller", "ap_review_team")


class ReviewActionIn(BaseModel):
    action: Literal["approved", "rejected", "reassigned", "commented"]
    actorRole: Literal[ROLES]
    actorName: str = Field(min_length=1)
    comment: str | None = None
    reassignedTo: Literal[ROLES] | None = None


HEADER_FIELDS = (
    "invoiceNumber", "invoiceDate", "dueDate", "supplierName", "supplierTaxId",
    "purchaseOrderNumber", "currency", "subtotal", "tax", "total", "remittanceDetails",
)
LINE_FIELDS = ("description", "quantity", "unitPrice", "lineTotal")
MONETARY_FIELDS = {"subtotal", "tax", "total", "unitPrice", "lineTotal"}


class FieldCorrectionIn(BaseModel):
    field: Literal[HEADER_FIELDS + LINE_FIELDS]
    value: str = Field(min_length=1)
    lineNumber: int | None = None
